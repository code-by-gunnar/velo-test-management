---
phase: 2
slug: test-cases
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.x |
| **Config file** | `apps/api/vitest.config.ts` and `apps/web/vitest.config.ts` (existing) |
| **Quick run command** | `pnpm --filter @velo/api test` |
| **Full suite command** | `pnpm -r test` |
| **Estimated runtime** | ~30 seconds (API integration w/ testcontainers) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @velo/api test`
- **After every plan wave:** Run `pnpm -r test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-W0 | 01 | 0 | TC-01,TC-04,TC-05,TC-06 | integration stub | `pnpm --filter @velo/api test -- test-cases` | ❌ W0 | ⬜ pending |
| 2-01-W0 | 01 | 0 | TC-03 | integration stub | `pnpm --filter @velo/api test -- suites` | ❌ W0 | ⬜ pending |
| 2-01-W0 | 01 | 0 | TC-02 | unit stub (jsdom) | `pnpm --filter @velo/web test -- StepEditor` | ❌ W0 | ⬜ pending |
| 2-TC-01 | 02 | 1 | TC-01 | integration | `pnpm --filter @velo/api test -- test-cases` | ❌ W0 | ⬜ pending |
| 2-TC-01 | 02 | 1 | TC-01 | integration (isolation) | `pnpm --filter @velo/api test -- test-cases` | ❌ W0 | ⬜ pending |
| 2-TC-02 | 02 | 1 | TC-02 | unit (jsdom) | `pnpm --filter @velo/web test -- StepEditor` | ❌ W0 | ⬜ pending |
| 2-TC-03 | 03 | 1 | TC-03 | integration | `pnpm --filter @velo/api test -- suites` | ❌ W0 | ⬜ pending |
| 2-TC-03 | 03 | 1 | TC-03 isolation | integration | `pnpm --filter @velo/api test -- suites` | ❌ W0 | ⬜ pending |
| 2-TC-04 | 04 | 2 | TC-04 | integration | `pnpm --filter @velo/api test -- test-cases` | ❌ W0 | ⬜ pending |
| 2-TC-05 | 04 | 2 | TC-05 move | integration | `pnpm --filter @velo/api test -- test-cases` | ❌ W0 | ⬜ pending |
| 2-TC-05 | 04 | 2 | TC-05 copy | integration | `pnpm --filter @velo/api test -- test-cases` | ❌ W0 | ⬜ pending |
| 2-TC-06 | 05 | 2 | TC-06 CSV | unit | `pnpm --filter @velo/api test -- import` | ❌ W0 | ⬜ pending |
| 2-TC-06 | 05 | 2 | TC-06 XLSX | unit | `pnpm --filter @velo/api test -- import` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/src/routes/__tests__/test-cases.test.ts` — stub file covers TC-01, TC-04, TC-05, TC-06
- [ ] `apps/api/src/routes/__tests__/suites.test.ts` — stub file covers TC-03 (tree query + workspace isolation)
- [ ] `apps/web/src/__tests__/StepEditor.test.tsx` — stub file covers TC-02 (keyboard navigation)
- [ ] `apps/api/src/lib/import-parser.ts` + `apps/api/src/lib/__tests__/import-parser.test.ts` — CSV/XLSX parsing unit tests
- [ ] `apps/api/src/routes/__tests__/fixtures/import-sample.csv` — CSV fixture
- [ ] `apps/api/src/routes/__tests__/fixtures/import-sample.xlsx` — XLSX fixture

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tab/Enter keyboard flow creates a case in ≤30s | TC-01 | Requires real browser interaction timing | Open /cases, press N, Tab through fields, Enter to add steps, Ctrl+S — stopwatch |
| Drag-and-drop reorder (cases and suites) | TC-04 | dnd-kit drag simulation unreliable in jsdom | In browser: drag a case row up/down, reload — verify position persisted |
| CSV/XLSX import full UI flow | TC-06 | File picker + preview UI requires real browser | Upload a CSV with 3+ cases each with 2+ steps, verify all rows imported correctly |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
