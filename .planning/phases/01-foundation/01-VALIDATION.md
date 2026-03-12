---
phase: 01
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (apps/api uses vitest for unit/integration tests) |
| **Config file** | apps/api/vitest.config.ts |
| **Quick run command** | `cd apps/api && pnpm test` |
| **Full suite command** | `pnpm --recursive lint && pnpm --recursive typecheck && cd apps/api && pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/api && pnpm test`
- **After every plan wave:** Run `pnpm --recursive lint && pnpm --recursive typecheck && cd apps/api && pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | INF-05 | migration | `cd apps/api && pnpm test` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 2 | INF-08 | integration | `cd apps/api && pnpm test` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 2 | INF-08 | integration | `cd apps/api && pnpm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test stubs for oauth-signin endpoint (3 resolution paths + 2 block paths)
- [ ] Test fixture for OAuth profile payloads (Google, GitHub)
- [ ] Null password_hash guard test for verify-credentials

*Existing test infrastructure (global-setup.ts, auth.test.ts) covers base setup.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration 0009 applies on fresh startup | INF-05 | Requires server restart with DB | Start API server, check logs for migration applied |

*All other behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
