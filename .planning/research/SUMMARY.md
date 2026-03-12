# Research Summary: GDPR & Data Lifecycle

**Project:** Velo v1.1
**Synthesized:** 2026-03-12
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md

---

## Stack Additions

**Zero new npm packages required.** Every GDPR capability maps onto existing BullMQ, postgres.js, Drizzle, Fastify, and Resend primitives.

- **BullMQ `lifecycle` queue** (new, separate from `email`) — delayed jobs with deterministic `jobId` for grace period scheduling and cancellation
- **Schema additions only:** 5 columns on `workspaces` table + new `user_erasure_requests` table + `erasure_audit_log` table
- **Existing R2 client** reused for avatar/CI payload cleanup during deletion
- **Existing Resend** reused for deletion confirmation emails
- **No cookie banner, no consent management, no external compliance tools** — legal basis is contract performance (not consent)

## Feature Table Stakes

| Feature | GDPR Article | Effort |
|---------|-------------|--------|
| Privacy policy page | Art. 13 | 1 day |
| Data export (personal data JSON) | Art. 20 | 1 day |
| User erasure + anonymization | Art. 17 | 2-3 days |
| Workspace hard-delete | Art. 17 | 2-3 days |
| Grace period + cancellation | ICO best practice | 1 day |
| Scheduled cleanup jobs | Art. 17 (completion) | 1 day |
| Erasure status visibility | Art. 12 | 0.5 day |

**Total estimate:** ~9 days implementation

## Watch Out For

### Critical (Must Address)
1. **JWT sessions survive erasure** — write Valkey blocklist entry at REQUEST time, not grace period end
2. **R2 objects orphaned after CASCADE** — enumerate R2 keys BEFORE DB delete; after CASCADE the key paths are gone
3. **Weak anonymization** — replace ALL PII fields (name, email, avatar_url, pending_email, password_hash), not just name/email
4. **Non-idempotent deletion jobs** — atomic status claim + check-then-act at every step
5. **Email UNIQUE constraint** — use `deleted-{uuid}@deleted.invalid` pattern to free original email for re-registration

### Moderate
6. **Workspace restore ≠ user erasure cancel** — separate lifecycle tracking, independent cancellation
7. **Audit log contains PII** — log UUIDs only, never name/email; add TTL
8. **CDN edge cache serves deleted avatars** — presigned URLs already expire in 1hr; acceptable for now

### Key Architectural Decisions
- **Cascade order:** Collect R2 keys → batch-delete R2 → delete workspace row (CASCADE handles DB)
- **Anonymize, don't delete** user rows — preserves referential integrity for other workspace members
- **Delayed jobs, not repeatable** — each deletion is a one-shot job; daily sweep as safety net
- **Session invalidation at request time** — leverages existing Valkey deactivation blocklist

## Build Order

```
Phase 1: Schema + privacy policy (foundation, no dependencies)
Phase 2: Lifecycle queue + workers (workspace delete + user anonymize)
Phase 3: API routes + data export
Phase 4: Frontend (settings UI, status banners, profile erasure)
Phase 5: Emails + notifications + integration tests
```

---

*Research files: STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md*
