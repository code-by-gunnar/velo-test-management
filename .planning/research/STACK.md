# Technology Stack

**Project:** Velo — QA Test Management Platform
**Researched:** 2026-03-12
**Scope (v1.1 update):** GDPR & Data Lifecycle additions only. All prior stack decisions remain valid.

---

## Already Decided (Reference Only)

| Layer | Decision | Version in package.json |
|-------|----------|--------------------------|
| Frontend | Next.js 16 Pages Router + TypeScript + Tailwind CSS | 16.1.6 |
| Backend | Node.js 22 LTS + Fastify 5 | ^5.0.0 |
| Database | PostgreSQL 16 + postgres.js + drizzle-kit | postgres ^3.4.8, drizzle-kit ^0.31.9 |
| ORM | Drizzle ORM (schema + migrations only; raw SQL for queries) | ^0.45.1 |
| Cache / Pub-Sub / Job Queue | Valkey via iovalkey + BullMQ | iovalkey ^0.3.3, bullmq ^5.70.4 |
| Auth | Auth.js v5 / next-auth beta.30 | 5.0.0-beta.30 |
| Storage | Cloudflare R2 via @aws-sdk/client-s3 | ^3.1005.0 |
| Email | Resend SDK | ^6.9.3 |
| Validation | Zod | ^4.3.6 |
| Testing | Vitest 2.x + @testing-library/react 16.x | ^2.0.0 |

---

## GDPR Milestone: Gap Analysis

The v1.1 milestone introduces the following capabilities that need stack evaluation:

1. **Grace period scheduling** — enqueue a hard-delete job 30 days (workspace) or 7 days (user) in the future, with ability to cancel before it fires
2. **Idempotent hard delete** — DELETE all workspace rows in correct FK order
3. **PII anonymization** — overwrite users.name, users.email, users.avatar_url in-place while preserving user.id for foreign key integrity
4. **Personal data export** — collect and JSON-serialize a user's personal data for download
5. **Schema additions** — workspace deletion state, user erasure request state
6. **Privacy policy page** — static content, no library needed

---

## GDPR Stack Decisions

### 1. Grace Period Scheduling — BullMQ Delayed Jobs (No New Library)

**Decision:** Use BullMQ's built-in `delay` option on `queue.add()`. No new library.

BullMQ already in the stack (`bullmq ^5.70.4`). Delayed jobs are a core BullMQ primitive: a job added with `{ delay: ms }` sits in Valkey's sorted set until the delay elapses, then becomes eligible for a worker. For the 30-day workspace deletion:

```typescript
await deletionQueue.add(
  'workspace-hard-delete',
  { workspaceId },
  {
    delay: 30 * 24 * 60 * 60 * 1000,  // 2_592_000_000 ms
    jobId: `workspace-delete:${workspaceId}`,  // deterministic ID for cancellation
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  }
)
```

**Cancellation (grace period undo):** A deterministic `jobId` makes cancellation trivial. Retrieve the job by ID and call `job.remove()`:

```typescript
const job = await deletionQueue.getJob(`workspace-delete:${workspaceId}`)
if (job) await job.remove()
```

This is the correct mechanism for "cancel workspace deletion during grace period." No deduplication plugin, no separate scheduler table — Valkey holds the pending job and the jobId is the handle to cancel it.

**Idempotency:** If the worker crashes mid-delete, BullMQ retries it (attempts: 3). The delete worker must be written idempotently (DELETE WHERE ... is naturally idempotent; each retry succeeds or is a no-op).

**Why not a cron job polling a DB flag:** Polling a `deletion_scheduled_at` column every hour is a simpler pattern but has a ±1 hour precision window and requires the worker to scan all workspaces on every tick. Delayed jobs are more precise and require no polling. The already-running BullMQ worker process handles them automatically.

**Why not `pg-boss` or a scheduled job service:** The existing Valkey + BullMQ infrastructure already handles this. Adding a second scheduler (node-cron, pg-boss, etc.) would duplicate infrastructure for no benefit.

**Confidence:** HIGH — BullMQ delayed jobs with deterministic jobIds is a documented, standard pattern. Verified against BullMQ docs (docs.bullmq.io/guide/jobs/delayed, docs.bullmq.io/guide/jobs/job-ids).

---

### 2. New BullMQ Queue: `lifecycle` (No New Library)

**Decision:** Add a new `lifecycle` queue alongside the existing `email` and `webhook` queues. No new library.

The lifecycle queue handles:
- `workspace-hard-delete` — fires after 30-day grace period
- `user-erasure` — fires after 7-day grace period

Keep this separate from the `email` queue to isolate failure domains: a transient Resend outage should not block hard deletes from processing.

**File structure to add:**

```
apps/api/src/queues/
  lifecycle.queue.ts     — Queue instance + job type definitions
  lifecycle.worker.ts    — Worker: hard delete workspace, anonymize user PII
```

**Confidence:** HIGH — mirrors the existing email.queue.ts / email.worker.ts pattern already in the codebase.

---

### 3. PII Anonymization — Raw SQL UPDATE (No New Library)

**Decision:** Write a plain SQL UPDATE in the lifecycle worker. No PostgreSQL Anonymizer extension, no external tool.

PostgreSQL Anonymizer extension (postgresql_anonymizer) is a PostreSQL C extension requiring server-side installation. Railway does not support custom PostgreSQL extensions beyond the pg_catalog defaults. It is the wrong tool for this use case: Velo needs to anonymize a single user record on-demand, not mask an entire dump.

The correct approach is a targeted UPDATE in the lifecycle worker:

```sql
UPDATE users
SET
  name = 'Deleted User',
  email = 'deleted-' || id::text || '@deleted.invalid',
  avatar_url = NULL,
  password_hash = 'REDACTED',
  email_verified = false
WHERE id = $1
```

The email replacement uses the user's UUID to guarantee uniqueness (the `email` column has a `UNIQUE` constraint). Using `@deleted.invalid` domain (RFC 2606 reserved) ensures the address is non-deliverable and unambiguously synthetic.

**Why not NULL for name/email:** The `users` table has `users.name` as nullable but `users.email` as NOT NULL UNIQUE. Setting email to NULL would violate the constraint. The `deleted-{uuid}@deleted.invalid` pattern satisfies the constraint while being clearly non-PII.

**Why not pg-anonymizer CLI tool:** `rap2hpoutre/pg-anonymizer` is a dump tool for test data generation, not for production on-demand erasure. Wrong use case.

**EDPB anonymization note:** The EDPB's 2025 enforcement report flagged weak anonymization as a compliance risk. The replacement values used here (non-reversible constant + UUID-derived synthetic email) meet the irreversibility standard because: (a) the original values are overwritten with no backup reference, (b) the UUID-derived email cannot be reversed to the original email, (c) Railway's 7-day backup retention window means the original data is fully purged within the GDPR "without undue delay" window.

**Confidence:** HIGH — this is a direct SQL operation using existing postgres.js; no library choice involved.

---

### 4. Personal Data Export — Native JSON Assembly (No New Library)

**Decision:** Assemble the export in the route handler using raw SQL, serialize with `JSON.stringify`, send as a file download. No library needed.

The scope is deliberately narrow (PROJECT.md: "name, email, avatar; small JSON download"). The handler:

1. Queries `users` for name, email, avatar_url, created_at
2. Serializes to `{ exportedAt, userData: { name, email, avatarUrl, createdAt } }`
3. Sets `Content-Disposition: attachment; filename="personal-data.json"` and `Content-Type: application/json`
4. Sends via `reply.send()`

No streaming, no zip file, no archiver library needed for this scope.

**Why not a zip/archiver library (e.g., `archiver`, `jszip`):** The export scope is a single small JSON object. Adding a zip library would be premature — revisit if/when attachments or run history export is added in a future milestone.

**Confidence:** HIGH — this is a first-principles API handler pattern.

---

### 5. Schema Additions — Drizzle ORM (No New Library)

**Decision:** Add new columns and one new table to the existing Drizzle schema. Run via the existing drizzle-kit migration pipeline.

#### New columns on `workspaces` table

```typescript
deletion_requested_at: timestamp("deletion_requested_at", { withTimezone: true }),
deletion_scheduled_for: timestamp("deletion_scheduled_for", { withTimezone: true }),
deletion_requested_by: uuid("deletion_requested_by").references(() => users.id, { onDelete: "set null" }),
```

These three columns are sufficient to drive UI state (show cancellation banner if `deletion_requested_at IS NOT NULL`), the lifecycle worker check (compare `deletion_scheduled_for` against now as a double-check), and audit log display.

**Why not a separate `workspace_deletion_requests` table:** For a single active deletion per workspace at any time, three nullable columns on the workspace row is simpler than a join. A separate table would be warranted if multiple pending requests needed to be tracked, which is not the case here.

#### New table: `user_erasure_requests`

```typescript
export const userErasureRequests = pgTable("user_erasure_requests", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workspace_id: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  requested_at: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  scheduled_for: timestamp("scheduled_for", { withTimezone: true }).notNull(),
  completed_at: timestamp("completed_at", { withTimezone: true }),
  // status: 'pending' before grace expires, 'completed' after anonymization runs
  status: varchar("status", { length: 20 }).notNull().default("pending"),
})
```

A separate table here (vs. columns on `workspace_members`) is correct because:
- A user can request erasure in multiple workspaces independently
- The request persists after anonymization completes (audit record)
- `ON DELETE CASCADE` from both `users` and `workspaces` ensures cleanup

**Confidence:** HIGH — direct Drizzle schema pattern matching existing codebase conventions.

---

### 6. Privacy Policy Page — Next.js Static Page (No New Library)

**Decision:** Create `/pages/privacy.tsx` as a static Next.js page. No CMS, no markdown renderer, no legal document library.

The privacy policy is plain HTML content rendered inline. It does not need to be CMS-editable pre-launch. A static page in the Pages Router is the correct scope.

**Why not a markdown renderer (remark, next-mdx-remote):** A single static page does not justify a markdown pipeline. The policy text is written once, stored in the file, updated via code commit when needed pre-launch.

**Confidence:** HIGH — this is a straightforward Next.js page.

---

## What NOT to Add

| Considered | Decision | Rationale |
|------------|----------|-----------|
| `postgresql_anonymizer` extension | Do not add | Requires server-side C extension; Railway does not support custom extensions. Wrong tool for on-demand single-row erasure. |
| `gdpr.js` or similar Node.js GDPR libraries | Do not add | These libraries are thin wrappers with minimal active maintenance. The required operations (SQL UPDATE, BullMQ delayed job, JSON export) are simpler to implement directly. |
| `archiver` / `jszip` | Do not add | Export scope is one small JSON object. Zip library is premature. |
| `node-cron` | Do not add | BullMQ delayed jobs replace the need for a cron-based poller. Adding node-cron would create a second scheduler competing with BullMQ. |
| Separate "erasure_log" audit table | Defer | GDPR Article 30 Records of Processing Activity explicitly out of scope for this milestone (PROJECT.md). |
| Cookie consent banner library (`react-cookie-consent`, `cookiebot`) | Do not add | App uses no tracking cookies. Session cookie is strictly necessary and exempt under PECR/UK GDPR. |
| DPA template library | Do not add | Deferred to legal review (PROJECT.md). |

---

## Integration Points with Existing Stack

| New Capability | Integrates With | How |
|----------------|-----------------|-----|
| Lifecycle queue (deletion/erasure jobs) | BullMQ + iovalkey | New Queue/Worker pair; same connection options as `email.queue.ts` |
| Hard delete worker | postgres.js `sql` | Direct SQL; NOT through `withWorkspace` (the workspace no longer exists at job time — run outside RLS context with explicit WHERE workspace_id = $1) |
| Anonymization worker | postgres.js `sql` | Direct UPDATE on `users` table; global connection, no tenant context needed |
| Grace period cancellation endpoint | BullMQ `queue.getJob(jobId).remove()` | Route handler in `workspaces.ts` |
| Data export endpoint | postgres.js `sql` + Fastify `reply.send()` | New route in `profile.ts` or new `privacy.ts` route file |
| Schema additions | drizzle-kit migration | `pnpm db:generate && pnpm db:migrate` |
| Deletion state UI | Next.js frontend | New banner component + API calls to `/api/workspaces/:id/deletion` |

---

## No New Dependencies Required

The v1.1 GDPR milestone requires zero new npm packages. All capabilities are satisfied by the existing stack:

| Capability | Existing Mechanism |
|------------|-------------------|
| Delayed grace period jobs | BullMQ `delay` option (already installed) |
| Job cancellation | BullMQ `queue.getJob(id).remove()` (built-in) |
| PII anonymization | postgres.js raw SQL UPDATE (already used) |
| Data export | postgres.js query + Fastify reply (already used) |
| Schema changes | drizzle-kit generate + migrate (already used) |
| Privacy page | Next.js static page (Pages Router) |
| Erasure confirmation email | Resend via existing email queue + worker |

---

## Version Verification

Current installed versions (from package.json as of 2026-03-12):

| Package | Installed | Status |
|---------|-----------|--------|
| bullmq | ^5.70.4 | Current — delayed jobs and deterministic jobIds confirmed supported |
| iovalkey | ^0.3.3 | Current — Valkey Redis-protocol compatibility confirmed |
| postgres | ^3.4.8 | Current — no changes needed |
| drizzle-orm | ^0.45.1 | Current — no changes needed |
| drizzle-kit | ^0.31.9 | Current — no changes needed |
| resend | ^6.9.3 | Current — use existing email queue for erasure confirmation emails |

No version bumps required for this milestone.

---

## Sources

- BullMQ Delayed Jobs documentation: https://docs.bullmq.io/guide/jobs/delayed
- BullMQ Job IDs documentation: https://docs.bullmq.io/guide/jobs/job-ids
- BullMQ Deduplication documentation: https://docs.bullmq.io/guide/jobs/deduplication
- BullMQ Remove Jobs documentation: https://docs.bullmq.io/guide/jobs/removing-job
- EDPB 2025 Right to Erasure Enforcement Report (via ReedSmith): https://www.reedsmith.com/our-insights/blogs/viewpoints/102mm9l/edpb-report-on-the-right-to-erasure-key-takeaways-from-the-2025-coordinated-enfo/
- GDPR Article 17 Right to Erasure: https://secureprivacy.ai/blog/how-to-respond-to-gdpr-right-to-erasure-request
- SPW Circular — Anonymization vs Erasure: https://spwcircular.com/blog/is-the-anonymization-of-personal-data-the-same-as-data-erasure/
- Iron Mountain — Anonymization as Erasure Equivalence: https://www.ironmountain.com/resources/blogs-and-articles/i/is-the-anonymization-of-personal-data-the-same-as-data-erasure
- PostgreSQL Anonymizer extension (evaluated and rejected): https://postgresql-anonymizer.readthedocs.io/
- GDPR for SaaS — Deleting personal data: https://gdpr4saas.eu/deleting-personal-data
- Railway PostgreSQL documentation (custom extension limitations): verified against project constraints
- Existing codebase: D:/git_repo/personal/velo-test-management/apps/api/src/
