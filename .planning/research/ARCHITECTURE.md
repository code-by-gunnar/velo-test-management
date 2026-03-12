# Architecture: GDPR & Data Lifecycle

**Project:** Velo v1.1
**Researched:** 2026-03-12
**Scope:** How workspace deletion and user erasure integrate with existing multi-tenant PostgreSQL architecture

---

## Workspace Deletion — Cascade Map

All tenant-scoped tables have `workspace_id` FK with `ON DELETE CASCADE`. Hard-deleting the workspace row cascades to:

```
workspaces (DELETE row)
  ├── workspace_members (ON DELETE CASCADE)
  ├── suites (ON DELETE CASCADE)
  │   └── test_cases (ON DELETE CASCADE via suite_id)
  │       └── test_case_steps (ON DELETE CASCADE via case_id)
  ├── test_runs (ON DELETE CASCADE)
  │   └── run_items (ON DELETE CASCADE via run_id)
  │       ├── run_item_step_comments (ON DELETE CASCADE via run_item_id)
  │       └── defects (ON DELETE CASCADE via run_item_id)
  ├── api_keys (ON DELETE CASCADE)
  ├── workspace_invitations (ON DELETE CASCADE)
  ├── ci_ingestion_runs (ON DELETE CASCADE)
  │   └── ci_ingestion_results (ON DELETE CASCADE)
  └── linear_connections (ON DELETE CASCADE)
```

### What CASCADE Does NOT Cover

| Item | Why | Fix |
|------|-----|-----|
| R2 objects (avatars, CI payloads) | External storage, no FK relationship | Enumerate R2 keys BEFORE DB delete, then batch-delete |
| Valkey keys (member_role:*, deactivated:*) | Cache layer, no FK | Scan and delete by workspace prefix pattern |
| BullMQ pending jobs | Queue state in Valkey | Cancel any pending lifecycle jobs for this workspace |
| Linear OAuth tokens | Stored in linear_connections (cascades), but remote state doesn't | Revoke Linear token before deletion if connected |

### R2 Cleanup Strategy

```
1. Query all avatar_url FROM users WHERE id IN (SELECT user_id FROM workspace_members WHERE workspace_id = ?)
2. Query all R2 keys from ci_ingestion_runs WHERE workspace_id = ? → build key pattern: ingestion/{workspaceId}/*
3. Batch-delete all R2 objects (avatars + CI payloads)
4. THEN delete workspace row (CASCADE handles DB)
```

**Critical:** Collect R2 keys BEFORE the CASCADE fires — after DB delete, the foreign key references are gone and you can't reconstruct the key paths.

---

## User Erasure — Anonymization Map

When a user requests erasure but the workspace stays, anonymize PII:

### Fields to Anonymize

| Table | Column | Action |
|-------|--------|--------|
| users | name | SET 'Deleted User' |
| users | email | SET 'deleted-{uuid}@deleted.invalid' |
| users | password_hash | SET NULL (or random hash) |
| users | avatar_url | DELETE from R2, SET NULL |
| users | pending_email | SET NULL |

### Fields Already Handled by FK

These columns use `ON DELETE SET NULL` on the `users` FK, so deleting the user row would NULL them automatically. However, since we're anonymizing (not deleting) the user row, we need to explicitly update:

| Table | Column | Current FK | Anonymization Action |
|-------|--------|-----------|---------------------|
| test_cases | created_by | ON DELETE SET NULL | No action needed — UUID stays, but name resolves to "Deleted User" via JOIN |
| run_items | executed_by | ON DELETE SET NULL | Same — UUID stays, name resolves to "Deleted User" |
| run_item_step_comments | created_by | ON DELETE SET NULL | Same |
| defects | created_by | ON DELETE SET NULL | Same |

**Key insight:** Since we anonymize the `users` row (not delete it), the `created_by` UUIDs still point to a valid user row — but that row now shows "Deleted User" instead of the real name. No need to touch child tables.

### Session Invalidation

- Write `deactivated:{workspaceId}:{userId}` to Valkey blocklist at erasure REQUEST time (not grace period end)
- Existing session plugin checks this blocklist — user is immediately locked out
- JWT tokens continue to exist but are functionally dead (preHandler returns 401)

---

## BullMQ Job Design

### Lifecycle Queue

New `lifecycle` queue (separate from `email` queue) — one queue per failure domain.

```typescript
// lifecycle.queue.ts
const lifecycleQueue = new Queue('lifecycle', { connection: valkey })

// Schedule workspace deletion
await lifecycleQueue.add('workspace-delete',
  { workspaceId, requestedBy },
  { delay: 30 * 24 * 60 * 60 * 1000, jobId: `ws-delete:${workspaceId}` }
)

// Schedule user erasure
await lifecycleQueue.add('user-erasure',
  { userId, workspaceId },
  { delay: 7 * 24 * 60 * 60 * 1000, jobId: `user-erase:${userId}` }
)

// Cancel (during grace period)
const job = await lifecycleQueue.getJob(`ws-delete:${workspaceId}`)
if (job) await job.remove()
```

**Delayed jobs, NOT repeatable.** Each deletion is a one-shot delayed job. Deterministic `jobId` enables cancellation by looking up the exact job.

### Daily Sweep (Safety Net)

A repeatable job that runs once per day to catch any expired grace periods where the delayed job failed:

```typescript
await lifecycleQueue.add('sweep-expired', {}, {
  repeat: { pattern: '0 3 * * *' }, // 3 AM daily
  jobId: 'sweep-expired'
})
```

The sweep queries `workspaces WHERE deletion_scheduled_at < NOW() AND status = 'pending_deletion'` and `user_erasure_requests WHERE scheduled_at < NOW() AND status = 'pending'`.

### Idempotency

Every step in the worker must be check-then-act:
- Check if workspace still exists before deleting
- Check if R2 objects exist before deleting
- Track progress in a `deletion_status` column (pending → processing → completed)
- Atomic status claim: `UPDATE workspaces SET deletion_status = 'processing' WHERE id = ? AND deletion_status = 'pending_deletion' RETURNING id` — prevents concurrent execution

---

## Schema Additions

### Workspace Deletion Columns

```sql
ALTER TABLE workspaces ADD COLUMN deletion_requested_at TIMESTAMPTZ;
ALTER TABLE workspaces ADD COLUMN deletion_scheduled_at TIMESTAMPTZ;
ALTER TABLE workspaces ADD COLUMN deletion_requested_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE workspaces ADD COLUMN deletion_job_id TEXT;
ALTER TABLE workspaces ADD COLUMN deletion_status TEXT; -- NULL, 'pending_deletion', 'processing', 'completed'
```

### User Erasure Requests Table

```sql
CREATE TABLE user_erasure_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, cancelled
  job_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Erasure Audit Log

```sql
CREATE TABLE erasure_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL, -- 'workspace' or 'user'
  entity_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'requested', 'cancelled', 'processing', 'completed'
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB -- non-PII metadata only (workspace member count, etc.)
);
```

---

## Suggested Build Order

```
1. Schema migration (deletion columns + erasure tables)
   └─ No dependencies
2. Lifecycle queue + workers (workspace delete + user anonymize)
   └─ Depends on: schema
3. API routes (request/cancel deletion, request/cancel erasure, data export)
   └─ Depends on: schema, lifecycle queue
4. Frontend (deletion UI in workspace settings, erasure UI in profile, status banners)
   └─ Depends on: API routes
5. Privacy policy page
   └─ No dependencies (can parallelize with 1-4)
6. Notification emails (deletion requested, grace warning, completed)
   └─ Depends on: API routes, existing email infrastructure
7. Integration tests (idempotent delete, cancellation, sweep job)
   └─ Depends on: all above
```

---

## Open Questions

- **Railway backup retention:** If Railway retains DB snapshots >30 days, workspace hard-delete is not fully GDPR-complete until backups cycle out. Document "put beyond use" policy.
- **Cloudflare CDN edge cache:** After R2 avatar delete, edge cache may still serve the image. Issue cache purge after R2 delete.
- **Email UNIQUE constraint:** After anonymizing email to `deleted-{uuid}@deleted.invalid`, the original email address is freed for re-registration. Verify this doesn't break Auth.js session lookups.

---

*Sources: PostgreSQL CASCADE documentation, BullMQ delayed jobs docs, ICO erasure guidance, EDPB 2025 enforcement report*
