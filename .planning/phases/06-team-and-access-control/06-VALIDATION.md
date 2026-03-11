---
phase: 6
slug: team-and-access-control
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-10
validated: 2026-03-11
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (existing, `apps/api/vitest.config.ts`) |
| **Config file** | `apps/api/vitest.config.ts` |
| **Quick run command** | `cd apps/api && pnpm test --reporter=verbose` |
| **Full suite command** | `pnpm --recursive lint && pnpm --recursive typecheck && cd apps/api && pnpm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/api && pnpm test --reporter=verbose`
- **After every plan wave:** Run `pnpm --recursive lint && pnpm --recursive typecheck && cd apps/api && pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 0 | USR-01–06 | stub | `cd apps/api && pnpm test members.test.ts` | ✅ | ✅ green |
| 06-02-01 | 02 | 1 | USR-01 | integration | `cd apps/api && pnpm test members.test.ts` | ✅ | ✅ green |
| 06-02-02 | 02 | 1 | USR-02 | integration | `cd apps/api && pnpm test members.test.ts` | ✅ | ✅ green |
| 06-02-03 | 02 | 1 | USR-05 | integration | `cd apps/api && pnpm test members.test.ts` | ✅ | ✅ green |
| 06-02-04 | 02 | 1 | USR-06 | integration | `cd apps/api && pnpm test members.test.ts` | ✅ | ✅ green |
| 06-03-01 | 03 | 2 | USR-03 | integration | `cd apps/api && pnpm test members.test.ts` | ✅ | ✅ green |
| 06-03-02 | 03 | 2 | USR-04 | integration | `cd apps/api && pnpm test members.test.ts` | ✅ | ✅ green |
| 06-04-01 | 04 | 3 | USR-01–04 | manual | Browser test | N/A | ✅ green |
| 06-05-01 | 05 | 4 | USR-01–06 | UAT | End-to-end manual | N/A | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `apps/api/src/routes/__tests__/members.test.ts` — stubs for USR-01 through USR-06
- [x] `apps/api/drizzle/0006_team_access_control.sql` — workspace_invitations migration
- [x] Drizzle schema entry for `workspaceInvitations` in `apps/api/src/db/schema.ts`

*All other test infrastructure was in place — no new framework installs required.*

---

## Requirement Coverage Detail

| Requirement | Description | Tests | Assertions |
|-------------|-------------|-------|------------|
| **USR-01** | Admin invites by email | 4 | 201 + email queued, 403 non-admin, 409 existing member, re-invite invalidation |
| **USR-02** | Accept invite flow | 4 | 200 + member row, 400 expired, 400 invalid token, 409 already-member |
| **USR-03** | Admin change role | 4 | 200 + DB updated, Valkey cache bust, 403 non-admin, tier cap enforcement |
| **USR-04** | Deactivate + session invalidation | 5 | 200 + is_active=false, Valkey blocklist 30d TTL, cache bust, 403, self-deactivation 400 |
| **USR-05** | Editor cap / viewer unlimited | 2 | Viewer 201, editor 403 TIER_LIMIT_EXCEEDED |
| **USR-06** | Tier enforcement + upgrade prompt | 2 | 403 + code, error contains "upgrade" |

**Total:** 21 automated integration tests + 2 traceability assertions = 23 tests in `members.test.ts`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Verified |
|----------|-------------|------------|-------------------|----------|
| Invite email received | USR-02 | Resend delivery | Send invite, check inbox | ✅ UAT |
| Accept invite landing page | USR-01 | Browser flow | Click invite link, verify workspace join | ✅ UAT |
| Role dropdown in Team tab | USR-03 | UI interaction | Change role via dropdown, verify immediate effect | ✅ UAT |
| Deactivate button | USR-04 | UI + session | Deactivate user, verify they cannot access workspace | ✅ UAT |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-11

---

## Validation Audit 2026-03-11

| Metric | Count |
|--------|-------|
| Requirements audited | 6 (USR-01 through USR-06) |
| Automated tests found | 23 |
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
| Coverage | 100% (all requirements have automated integration tests) |
