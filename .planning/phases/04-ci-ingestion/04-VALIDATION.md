---
phase: 4
slug: ci-ingestion
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.x |
| **Config file** | `apps/api/vitest.config.ts` |
| **Quick run command** | `cd apps/api && pnpm test` |
| **Full suite command** | `pnpm --recursive lint && pnpm --recursive typecheck && cd apps/api && pnpm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/api && pnpm test`
- **After every plan wave:** Run `pnpm --recursive lint && pnpm --recursive typecheck && cd apps/api && pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 0 | IN-01 | unit | `cd apps/api && pnpm test` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 0 | IN-02 | unit | `cd apps/api && pnpm test` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 0 | IN-03 | unit | `cd apps/api && pnpm test` | ❌ W0 | ⬜ pending |
| 04-01-04 | 01 | 0 | IN-04 | unit | `cd apps/api && pnpm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/junit-parser.test.ts` — stubs for IN-01, IN-03 (JUnit XML parsing, multi-variant)
- [ ] `src/lib/__tests__/allure-parser.test.ts` — stubs for IN-02 (Allure JSON parsing)
- [ ] `src/routes/__tests__/ingestion.test.ts` — stubs for IN-01, IN-02 (API endpoint integration)
- [ ] `src/lib/__tests__/r2-storage.test.ts` — stubs for IN-04 (R2 upload/retrieval)
- [ ] `tests/fixtures/junit/` — JUnit XML fixture files (pytest, Surefire, Gradle, Jest-junit, gotestsum)
- [ ] `tests/fixtures/allure/` — Allure JSON fixture files

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| R2 upload to real bucket | IN-04 | Requires Cloudflare credentials | POST a JUnit XML, verify raw payload appears in R2 dashboard |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
