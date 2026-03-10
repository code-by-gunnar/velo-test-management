# Phase 6: Team and Access Control — Research

**Researched:** 2026-03-10
**Domain:** RBAC, workspace invitations, session invalidation, plan tier enforcement
**Confidence:** HIGH

---

## Summary

Phase 6 adds multi-user team management to a codebase that already has 80% of the necessary infrastructure in place. The `workspace_members` table (with `role` and `is_active` columns), `workspaceRoleEnum` (admin/editor/viewer), and `planTierEnum` (free/starter/growth/enterprise) are all defined in the existing schema. The `GET /api/workspaces/:workspaceId/members` endpoint already exists and is functional. The Free tier editor cap logic pattern exists in the project creation route (three-editor cap, one-project cap, 500-case cap are all constants in `workspaces.ts`).

What is missing: invitation token infrastructure (a new DB table), the invite-accept flow (new user path vs existing user path), Valkey-based session invalidation for deactivation, role change propagation to the JWT without requiring sign-out, and the frontend Team tab in workspace settings.

The core architectural challenge is immediate session invalidation on deactivation. Auth.js v5 uses stateless JWTs. The established project pattern for "check on every request" is already in the session plugin — the right approach is to add an `is_active` check inside the existing session pre-handler hook (Valkey cache lookup for deactivated user IDs, falls back to DB, TTL of 60s). This mirrors the membership caching pattern already noted in the architecture decisions.

**Primary recommendation:** Build a `workspace_invitations` table, add a Valkey blocklist for deactivated users checked inside the session plugin, and extend the workspace settings page with a "Team" tab — following all existing patterns exactly.

---

## Standard Stack

### Core (all already in the project)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| postgres.js | existing | Raw SQL queries for invite CRUD, member management | Already in use |
| iovalkey | existing | Valkey client — deactivation blocklist, membership cache | Already in use |
| Resend SDK | existing | Send invitation emails | `resend` export from `apps/api/src/lib/email.ts` already wired |
| BullMQ | existing | Email queue for invitation sends | `emailQueue` in `queues/email.queue.ts` already in use |
| Auth.js v5 | existing | Session JWT, custom fields (workspace_id, role) | JWE decryption in `plugins/session.plugin.ts` |
| uuidv7 | existing | Invitation token IDs | Already the PK strategy for all tables |
| crypto (Node built-in) | Node 22 | `randomBytes(32)` for invite token generation | Same pattern as password reset tokens |
| bcrypt | existing | Hash invite tokens before storage | Same pattern as verification/reset tokens |
| drizzle-kit | existing | Schema definition, migration generation | Migration-only; postgres.js for runtime |
| react-hook-form + zod | existing | Frontend invite/role forms | Pattern from signup, login pages |

### No New Dependencies Required
All required functionality is achievable with existing dependencies. Do NOT add new libraries.

---

## Architecture Patterns

### Recommended Project Structure (new files only)
```
apps/api/src/
├── routes/
│   └── members.ts               # NEW: invite, list, role change, deactivate
├── routes/__tests__/
│   └── members.test.ts          # NEW: tests for all USR-01–USR-06
apps/web/src/
├── components/settings/
│   └── TeamPanel.tsx            # NEW: member list + invite form + role dropdown
└── pages/
    └── app/[slug]/accept-invite.tsx  # NEW: invite acceptance landing page
```

Schema additions (one new table + Drizzle migration):
```
apps/api/drizzle/
└── XXXX_phase6_invitations.sql  # NEW: workspace_invitations table
```

### Pattern 1: Invitation Token (mirrors password reset pattern exactly)

**What:** A `workspace_invitations` table stores invite metadata + bcrypt-hashed token. The raw token is sent via email in a URL. On acceptance, the raw token is compared against the hash.

**Schema:**
```typescript
// In schema.ts — add alongside existing tables
export const workspaceInvitations = pgTable("workspace_invitations", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  workspace_id: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  role: workspaceRoleEnum("role").notNull().default("editor"),
  token_hash: text("token_hash").notNull(),   // bcrypt hash of raw token
  invited_by: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  accepted_at: timestamp("accepted_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
```

**Token generation (mirrors `generateResetToken()` in auth.ts):**
```typescript
// In members.ts
import crypto from "node:crypto"
import bcrypt from "bcrypt"

function generateInviteToken(): string {
  return crypto.randomBytes(32).toString("hex")  // 64-char hex string
}

// Store:
const token = generateInviteToken()
const tokenHash = await bcrypt.hash(token, 10)  // 10 rounds (same as OTP/reset)
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)  // 7 days

// URL sent in email:
const inviteUrl = `${process.env.WEB_URL}/accept-invite?token=${token}&workspace=${workspaceId}`
```

**Verification (mirrors password reset verification):**
```typescript
// On POST /api/workspaces/:workspaceId/invitations/accept
const [invite] = await sql`
  SELECT id, token_hash, expires_at, role, accepted_at
  FROM workspace_invitations
  WHERE workspace_id = ${workspaceId}::uuid
    AND email = ${email.toLowerCase()}
    AND accepted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1
`
if (!invite || new Date(invite.expires_at) < new Date()) {
  return reply.status(400).send({ error: "Invalid or expired invitation" })
}
const isValid = await bcrypt.compare(rawToken, invite.token_hash)
if (!isValid) return reply.status(400).send({ error: "Invalid or expired invitation" })
```

### Pattern 2: Dual Accept Path (new user vs existing user)

**What:** The invite acceptance endpoint must handle two cases:
1. Email is NOT in `users` table — redirect to `/signup?invite=TOKEN&workspace=ID&email=EMAIL` so user creates account, then auto-accepts
2. Email IS in `users` table — add them to workspace_members directly, return 200

**Critical:** The signup page already exists. Do NOT build a separate signup flow. Instead:
- The `/accept-invite` page checks which case applies and branches accordingly
- If the user needs to sign up first, store the invite token in a short-lived Valkey key (TTL 10 min) and redirect to signup, which after success redirects back to `/accept-invite?token=...`
- Alternatively (simpler): `/accept-invite` always shows "Sign in or create an account to accept" — user signs in/up, then re-hits the same URL to complete acceptance. The invite token is valid for 7 days, so this round-trip is safe.

**Recommended simpler approach:** Accept endpoint requires an authenticated session. If unauthenticated, redirect to `/login?next=/accept-invite?token=TOKEN`. After auth, the same page re-fires the accept call. This avoids Valkey state and matches the existing `requireAuth` redirect pattern.

### Pattern 3: Immediate Session Invalidation on Deactivate (USR-04)

**What:** When a workspace admin sets `is_active = false` on a member, their current JWT remains valid for its remaining TTL (up to 30 days). To reject them on the next request without waiting for token expiry, add a Valkey blocklist check inside the session plugin.

**How it fits in the existing session plugin:**

The session plugin already runs as a `preHandler` hook on every request and populates `request.userId`, `request.workspaceId`, `request.userRole`. After decoding the JWT, it should also check whether the user's membership in the current workspace is still active.

```typescript
// Inside session plugin preHandler, after decoding JWT payload:
if (id && workspaceId) {
  // Check deactivation blocklist: O(1) Valkey lookup
  const blockedKey = `deactivated:${workspaceId}:${id}`
  const isBlocked = await fastify.valkey.get(blockedKey)
  if (isBlocked) {
    // Clear request context — next requireAuth preHandler will return 401
    request.userId = ""
    request.workspaceId = null
    request.userRole = null
    return
  }
}
```

**Setting the blocklist on deactivation:**
```typescript
// In PATCH /api/workspaces/:workspaceId/members/:userId
// After setting is_active = false:
await fastify.valkey.set(
  `deactivated:${workspaceId}:${targetUserId}`,
  "1",
  "EX",
  60 * 60 * 24 * 30  // 30 days — covers max JWT TTL
)
```

**Why not check DB on every request:** A DB lookup on every request is too expensive. Valkey GET is O(1) and sub-millisecond. The blocklist key is only set when a user is deactivated, so the common path (active user) is a fast cache miss.

**Alternative approach (also valid):** Cache membership status in Valkey with 60s TTL. On deactivation, `DEL` the membership cache key. Next request re-fetches from DB and finds `is_active = false`, returns 401 + sets blocklist. This adds 60s maximum delay, which the requirement says "immediately" — so the blocklist approach with direct SET on deactivation is cleaner.

### Pattern 4: Role Change Without Sign-Out (USR-03)

**The problem:** The JWT contains `role`. If an admin changes a member's role from editor to viewer, the JWT still says "editor" until the next sign-in.

**The existing JWT shape:**
```typescript
// From session.plugin.ts — decoded JWT payload:
request.userRole = (payload["role"] as string | null | undefined) ?? null
```

**Solution:** On every request that requires role checking, do NOT trust `request.userRole` from JWT alone — verify role from DB (or Valkey cache with short TTL). The same Valkey membership cache pattern used elsewhere in the project applies here.

**Concrete pattern:**
```typescript
// Role check helper (use in members.ts routes that need admin check)
async function assertAdminRole(workspaceId: string, userId: string, fastify: FastifyInstance): Promise<boolean> {
  // Cache key: member role, 60s TTL
  const cacheKey = `member_role:${workspaceId}:${userId}`
  const cached = await fastify.valkey.get(cacheKey)
  if (cached) return cached === "admin"

  const rows = await sql`
    SELECT role FROM workspace_members
    WHERE workspace_id = ${workspaceId}::uuid
      AND user_id = ${userId}::uuid
      AND is_active = true
  `
  const role = rows[0]?.role ?? null
  if (role) await fastify.valkey.set(cacheKey, role, "EX", 60)
  return role === "admin"
}

// On role change — bust the cache:
await fastify.valkey.del(`member_role:${workspaceId}:${targetUserId}`)
```

**Outcome:** Role takes effect within 60 seconds of next request without sign-out. If the requirement is "takes effect on the next request", the cache TTL must be very short (1-5s) or the cache must be busted on every role change. Busting the cache on PATCH role change + 60s TTL fallback satisfies both correctness and performance.

### Pattern 5: Free Tier Enforcement (USR-05, USR-06)

**What already exists:** The `FREE_TIER_LIMITS` constant in `workspaces.ts` enforces 3 editors and 1 project. The test-case 500-case limit is defined but not currently checked on every case creation — that gap should be closed here.

**What needs to be added:**

```typescript
// In workspaces.ts — FREE_TIER_LIMITS already has these values:
const FREE_TIER_LIMITS = {
  max_editors: 3,
  max_projects: 1,
  max_test_cases: 500,
} as const

// New: editor seat check on invitation acceptance AND role upgrade to editor:
if (member.plan_tier === "free" && invitedRole === "editor") {
  const editorCount = await withWorkspace(workspaceId, async (tx) =>
    tx`SELECT COUNT(*) AS n FROM workspace_members
       WHERE workspace_id = ${workspaceId}::uuid
         AND role = 'editor'
         AND is_active = true`
  )
  if (parseInt(editorCount[0]?.n ?? "0") >= FREE_TIER_LIMITS.max_editors) {
    return reply.status(403).send({
      error: `Free tier allows ${FREE_TIER_LIMITS.max_editors} editors. Upgrade to invite more editors.`,
      code: "TIER_LIMIT_EXCEEDED",
      limit: "max_editors",
    })
  }
}
```

**Note:** Count admins toward the editor cap or not? Clarification: The requirement says "3 editors" specifically. Admins are a superset of editors in terms of permissions. The existing schema counts them separately. The safe interpretation: admins do NOT count toward the editor cap (they are a separate, typically limited role — usually just 1). Keep the existing pattern where the cap is only on `role = 'editor'`.

**Test case 500-limit:** The existing `FREE_TIER_LIMITS.max_test_cases = 500` is defined but the check is not wired in the test cases creation route. Phase 6 must add this check in `POST /suites/:suiteId/cases` (or wherever test case creation happens) using the same pattern.

### Pattern 6: Email Invitation (USR-02)

**Existing infrastructure:**
- `resend` singleton export from `apps/api/src/lib/email.ts`
- `emailQueue` in `queues/email.queue.ts` — BullMQ queue with 3 retry attempts, exponential backoff
- `emailWorker` in `queues/email.worker.ts` — processes the queue

**Adding invitation email type:**
```typescript
// Extend EmailJobData in email.queue.ts:
export interface EmailJobData {
  to: string
  subject: string
  type: "otp" | "password-reset" | "welcome" | "workspace-invite"  // add invite type
  payload: Record<string, unknown>
}

// In email.worker.ts — add case in the switch:
case "workspace-invite": {
  const { inviteUrl, workspaceName, inviterName } = job.data.payload
  await resend.emails.send({
    from: FROM,
    to: job.data.to,
    subject: `You've been invited to join ${workspaceName} on Velo`,
    text: `${inviterName} has invited you to join the ${workspaceName} workspace on Velo.\n\nAccept your invitation:\n${inviteUrl}\n\nThis invitation expires in 7 days.`,
  })
  break
}
```

**Note:** The email worker currently has a TODO stub and does not call Resend. Phase 6 should complete the worker implementation for the `workspace-invite` type. The `otp` and `password-reset` types currently call Resend directly from route handlers (not via the queue). For consistency, invitation emails should go through the queue for retry resilience.

### Anti-Patterns to Avoid

- **Trusting JWT role for authorization:** Always verify role from Valkey cache (60s TTL) or DB. The JWT role can be stale after a role change.
- **DB lookup on every request for deactivation check:** Use the Valkey blocklist. DB is too slow for a global preHandler hook.
- **Building a separate signup page for invited users:** Reuse the existing `/signup` page. Pass invite token via query param, complete invite acceptance after auth.
- **Storing raw invite tokens:** Always bcrypt-hash before storing in DB (same as password reset pattern).
- **Using `SET` instead of `SET LOCAL` inside withWorkspace:** Already established — always use withWorkspace for tenant queries.
- **Calling `reply.send()` inside withWorkspace callback:** Already established project pitfall — always call after the transaction.
- **Counting admins toward the editor cap:** Admins are a separate role. Only count `role = 'editor'` toward the editor seat limit.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email delivery with retry | Custom retry loop | BullMQ `emailQueue` (3 attempts, exponential backoff) | Already wired; handles Resend transient failures |
| Token generation | Custom PRNG | `crypto.randomBytes(32)` | Already the project pattern for reset tokens |
| Token hashing | SHA-256 direct | `bcrypt.hash(token, 10)` | Consistent with all other tokens in the project |
| Rate limiting invite sends | Custom counter | Existing Valkey rate limiter from Phase 5 (05-02) | Already built with fixed-window per route |
| Session invalidation | JWT blacklist in DB | Valkey blocklist with TTL | O(1) vs O(n) DB query per request |
| Role caching | DB query per request | Valkey cache with 60s TTL + cache bust on change | Same pattern already noted in architecture decisions |

---

## Common Pitfalls

### Pitfall 1: Invite Acceptance Race Condition
**What goes wrong:** Two concurrent accept requests for the same invite token both pass the `accepted_at IS NULL` check and both add the user to `workspace_members`, violating the unique constraint `(workspace_id, user_id)`.
**Why it happens:** No atomic lock between invite check and member insert.
**How to avoid:** Run the invite verification AND member insert in a single DB transaction. The unique constraint on `workspace_members(workspace_id, user_id)` will reject the second insert with a Postgres 23505 error, which the route handler should catch and return 409 (already a member).
**Warning signs:** 500 errors from Postgres `duplicate key value` in logs.

### Pitfall 2: JWT Role Stale After PATCH Role Change
**What goes wrong:** Admin changes a member's role from editor to viewer. Member's next request still uses their JWT which says `role: "editor"`, bypassing viewer restrictions.
**Why it happens:** JWT is stateless; `request.userRole` comes from the token, not DB.
**How to avoid:** Route handlers that check roles MUST use the Valkey cache (or bare DB lookup) — not `request.userRole` from JWT. The session plugin only populates `userRole` for convenience; authorization logic must re-verify.
**Warning signs:** Editor-only routes accessible to recently downgraded viewers.

### Pitfall 3: Deactivation Not Taking Effect Immediately
**What goes wrong:** Admin deactivates a user, but the user's requests still succeed because their JWT is valid.
**Why it happens:** Stateless JWT. If the session plugin only checks JWT validity (not DB membership), deactivated users continue to have access.
**How to avoid:** The Valkey blocklist approach (Pattern 3 above) catches this on the next request. Make sure the blocklist SET happens atomically BEFORE returning 200 from the deactivation endpoint.
**Warning signs:** Deactivated user can still access API routes.

### Pitfall 4: Editor Count Includes Deactivated Members
**What goes wrong:** Counting editors toward the Free tier cap includes `is_active = false` members, artificially hitting the limit even when seats are free.
**Why it happens:** Forgetting `AND is_active = true` in the count query.
**How to avoid:** Always include `AND is_active = true` in seat count queries.
**Code:**
```sql
SELECT COUNT(*) FROM workspace_members
WHERE workspace_id = $1
  AND role = 'editor'
  AND is_active = true  -- critical: only count active seats
```

### Pitfall 5: Invite to Existing User — Skipping Workspace Assignment
**What goes wrong:** When inviting an email that already exists in `users`, the route creates a `workspace_members` record but the invitee's JWT still has their old `workspace_id`. They land on the wrong workspace.
**Why it happens:** JWT workspace_id is set at login time. Adding them to a new workspace doesn't update the JWT.
**How to avoid:** After accepting an invite to a new workspace, the user must sign in to that workspace (or the accept page calls `session.update()` if Auth.js supports it). Document this as a UX step: "You are now a member of [workspace]. Sign in to switch to it." Do NOT try to programmatically force a JWT update — that requires server-side session manipulation which Auth.js v5 JWTs don't easily support.
**Note:** For new users (no prior account), the issue doesn't arise — the accept-invite flow ends with sign-in, which sets `workspace_id` correctly in the new JWT.

### Pitfall 6: Missing `deleted_at` Filter on Projects/Cases for Tier Check
**What goes wrong:** The test case count for the Free tier 500-case limit counts deleted cases because `deleted_at` is not filtered.
**Why it happens:** `test_cases` has soft deletes (`deleted_at` column). The count query must filter `WHERE deleted_at IS NULL`.
**How to avoid:**
```sql
SELECT COUNT(*) FROM test_cases
WHERE workspace_id = $1
  AND project_id = $2
  AND deleted_at IS NULL  -- critical: don't count soft-deleted cases
```

---

## Code Examples

Verified patterns from existing codebase:

### Existing Free Tier Enforcement Pattern (from workspaces.ts)
```typescript
// Source: apps/api/src/routes/workspaces.ts — POST /api/workspaces/:workspaceId/projects
if (member.plan_tier === "free") {
  const countRows = await withWorkspace(workspaceId, async (tx) =>
    tx`SELECT COUNT(*) AS n FROM projects WHERE workspace_id = ${workspaceId}::uuid`
  )
  if (parseInt(countRows[0]?.n ?? "0") >= FREE_TIER_LIMITS.max_projects) {
    return reply.status(403).send({
      error: `Free tier allows ${FREE_TIER_LIMITS.max_projects} project. Upgrade to Starter to add more.`,
      code: "TIER_LIMIT_EXCEEDED",
      limit: "max_projects",
    })
  }
}
```
The editor seat check follows this exact pattern: count active editors, compare to `FREE_TIER_LIMITS.max_editors`.

### Existing Token Hash Pattern (from auth.ts — password reset)
```typescript
// Source: apps/api/src/routes/auth.ts — POST /api/auth/forgot-password
const token = generateResetToken()          // crypto.randomBytes(32).toString("hex")
const tokenHash = await bcrypt.hash(token, 10)
const expiresAt = new Date(Date.now() + RESET_EXPIRY_HOURS * 60 * 60 * 1000)

await sql`
  INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
  VALUES (${uuidv7()}::uuid, ${user.id}::uuid, ${tokenHash}, ${expiresAt})
`
const resetUrl = `${process.env.WEB_URL}/reset-password?token=${token}&email=...`
```
Invitation tokens use the same pattern. Replace `password_reset_tokens` with `workspace_invitations`.

### Existing Member List Pattern (from workspaces.ts)
```typescript
// Source: apps/api/src/routes/workspaces.ts — GET /api/workspaces/:workspaceId/members
const members = await withWorkspace(workspaceId, async (tx) => {
  return tx.unsafe(`
    SELECT wm.user_id, u.email, wm.role, wm.created_at AS joined_at
    FROM workspace_members wm
    INNER JOIN users u ON u.id = wm.user_id
    WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
      AND wm.is_active = true
    ORDER BY wm.created_at ASC
  `)
})
```
The Team panel UI consumes this existing endpoint. No new GET endpoint required.

### Existing Email Dispatch Pattern (from auth.ts)
```typescript
// Source: apps/api/src/routes/auth.ts — direct Resend call
await sendPasswordResetEmail(email, resetUrl)

// For invitations — use the queue for retry resilience:
await emailQueue.add("workspace-invite", {
  to: inviteeEmail,
  subject: `You've been invited to join ${workspaceName} on Velo`,
  type: "workspace-invite",
  payload: { inviteUrl, workspaceName, inviterName },
})
```

### Existing Admin Guard Pattern (from workspaces.ts)
```typescript
// Source: apps/api/src/routes/workspaces.ts — PATCH /api/workspaces/:id/slug
const member = await sql`
  SELECT wm.role FROM workspace_members wm
  WHERE wm.workspace_id = ${id}::uuid
    AND wm.user_id = ${userId}::uuid
    AND wm.is_active = true
`
if (member.length === 0 || member[0]?.role !== "admin") {
  return reply.status(403).send({ error: "Admin access required" })
}
```
All USR-01, USR-03, USR-04 routes (invite, role change, deactivate) use this guard.

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| DB session store for invalidation | Valkey blocklist with TTL | JWT stateless + blocklist = immediate invalidation without DB overhead |
| Separate invite signup page | Reuse existing /signup with query params | Less code, consistent UX |
| Periodic role sync via cron | Valkey cache with 60s TTL + bust on change | Near-real-time role changes without per-request DB cost |

---

## Open Questions

1. **Session.update() support for workspace switching after invite acceptance**
   - What we know: Auth.js v5 `session.update()` exists but its interaction with custom JWT fields (workspace_id) depends on the jwt callback implementation
   - What's unclear: Whether calling `session.update({ workspace_id: newId })` works in the existing implementation
   - Recommendation: Do not rely on `session.update()` for invite acceptance. Require the user to sign out and sign back in to activate the new workspace context. Make this explicit in the UI: "You've joined [workspace]. Sign in to access it."

2. **Admin count toward editor cap**
   - What we know: The requirement says "3 editors" for Free tier. The `workspaceRoleEnum` has admin/editor/viewer as separate values.
   - What's unclear: Does "3 editors" mean 3 people with write access (admins + editors combined) or literally 3 records with `role = 'editor'`?
   - Recommendation: Count only `role = 'editor'` records. Admins are typically just 1 person (the workspace creator). This is the most permissive interpretation and avoids surprising the admin who created the workspace.

3. **Re-invite an already-invited email**
   - What we know: The `workspace_invitations` table will have multiple rows per email if invites are re-sent
   - What's unclear: Should re-invite invalidate the old invite or coexist?
   - Recommendation: Invalidate old invites for the same email in the same workspace when re-inviting (set `accepted_at = NOW()` to mark them consumed). Only the newest invite token is valid.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (existing, `apps/api/vitest.config.ts`) |
| Config file | `apps/api/vitest.config.ts` |
| Quick run command | `cd apps/api && pnpm test --reporter=verbose` |
| Full suite command | `pnpm --recursive lint && pnpm --recursive typecheck && cd apps/api && pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| USR-01 | Admin can invite member by email | Integration | `cd apps/api && pnpm test members.test.ts` | Wave 0 |
| USR-02 | Invited user receives email with invite link | Integration (mock emailQueue) | `cd apps/api && pnpm test members.test.ts` | Wave 0 |
| USR-03 | Admin can assign/change roles; takes effect within 60s | Integration + Valkey mock | `cd apps/api && pnpm test members.test.ts` | Wave 0 |
| USR-04 | Admin can deactivate; session invalidated immediately | Integration + Valkey mock | `cd apps/api && pnpm test members.test.ts` | Wave 0 |
| USR-05 | Viewer seats unlimited; editor seats capped per tier | Integration | `cd apps/api && pnpm test members.test.ts` | Wave 0 |
| USR-06 | Free tier limits enforced at API layer with upgrade error | Integration | `cd apps/api && pnpm test members.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd apps/api && pnpm test --reporter=verbose`
- **Per wave merge:** `pnpm --recursive lint && pnpm --recursive typecheck && cd apps/api && pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/api/src/routes/__tests__/members.test.ts` — covers USR-01 through USR-06
- [ ] `apps/api/drizzle/XXXX_phase6_invitations.sql` — workspace_invitations migration
- [ ] Drizzle schema entry for `workspaceInvitations` in `apps/api/src/db/schema.ts`

*(All other test infrastructure is in place — no new framework installs required)*

---

## Phase 6 Plan Shape (for planner)

Based on the research, the natural wave breakdown is:

**Wave 0 (Plan 06-01):** Migration (workspace_invitations table), schema.ts update, test stubs for all USR requirements, Wave 0 infra.

**Wave 1 (Plan 06-02):** Backend — invitation CRUD routes (POST invite, POST accept, GET pending invites), admin role check guard, plan tier editor cap enforcement on invite and role upgrade. All USR-01, USR-02, USR-05, USR-06 backend work.

**Wave 2 (Plan 06-03):** Backend — role change route (PATCH member role), deactivation route (PATCH member is_active), Valkey blocklist for deactivation, Valkey role cache with bust. USR-03, USR-04 backend work. Session plugin extension for blocklist check.

**Wave 3 (Plan 06-04):** Frontend — Team tab in workspace settings page (member list, invite form, role dropdown, deactivate button). Accept invite landing page (`/accept-invite`). USR-01 through USR-04 frontend.

**Wave 4 (Plan 06-05):** Human verification UAT — all USR-01 through USR-06 end-to-end.

Total: 5 plans.

---

## Sources

### Primary (HIGH confidence)
- `apps/api/src/db/schema.ts` — workspace_members, workspaceRoleEnum, planTierEnum, existing table shapes
- `apps/api/src/routes/workspaces.ts` — FREE_TIER_LIMITS, admin guard pattern, member list, withWorkspace usage
- `apps/api/src/routes/auth.ts` — token generation/hashing pattern (generateResetToken, bcrypt usage)
- `apps/api/src/lib/email.ts` — Resend singleton, email function signatures
- `apps/api/src/queues/email.queue.ts` — EmailJobData interface, queue configuration
- `apps/api/src/plugins/session.plugin.ts` — JWT decode, request decoration, preHandler hook structure
- `apps/api/src/plugins/auth.plugin.ts` — requireAuth pattern, API key auth
- `apps/api/src/lib/valkey.ts` — Valkey connection, createWorkerConnection, getBullMQConnectionOptions
- `.planning/STATE.md` — architecture decisions, locked patterns (WorkspaceSql, withWorkspace, Valkey cache 60s TTL)
- `.planning/REQUIREMENTS.md` — USR-01 through USR-06 definitions

### Secondary (MEDIUM confidence)
- Auth.js v5 stateless JWT behavior — deactivation requires out-of-band blocklist; session.update() may work for workspace switching but is untested in this codebase

### Tertiary (LOW confidence)
- session.update() behavior for custom JWT fields — unverified in this specific Auth.js v5 + custom JWE implementation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all existing dependencies, no new installs
- Architecture: HIGH — all patterns derived from existing codebase code
- Pitfalls: HIGH — derived from existing `## Accumulated Context` decisions and established patterns
- Session invalidation: MEDIUM — blocklist approach is well-established but untested in this specific combination

**Research date:** 2026-03-10
**Valid until:** 2026-06-10 (stable stack)

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| USR-01 | Workspace admin can invite team members by email | Pattern 1 (invite token), Pattern 6 (email queue), admin guard pattern from workspaces.ts |
| USR-02 | Invited user receives email with sign-up/join link (Resend) | emailQueue + email.worker.ts extension; invite URL pattern mirrors password reset |
| USR-03 | Workspace admin can assign roles: Admin, Editor, Viewer; takes effect on next request | Pattern 4 (Valkey role cache + cache bust on PATCH role change) |
| USR-04 | Workspace admin can deactivate a team member (revokes access immediately) | Pattern 3 (Valkey blocklist in session plugin preHandler hook) |
| USR-05 | Viewer role has unlimited seats; Editor seats are capped per tier | Pattern 5 (editor count query with is_active=true filter, same FREE_TIER_LIMITS constant) |
| USR-06 | Plan tier limits enforced at API layer with clear error + upgrade prompt | Pattern 5, same TIER_LIMIT_EXCEEDED code pattern from workspaces.ts project creation |
</phase_requirements>
