# Roadmap: Velo

**Project:** Velo QA Test Management Platform
**Scope:** Phase 1 (Foundation) + Phase 2 (Core MVP)
**Granularity:** Standard
**Created:** 2026-03-08
**Coverage:** 48/48 v1 requirements mapped

---

## Phases

- [ ] **Phase 1: Foundation** - Deployable scaffold with CI/CD, schema, auth, workspace isolation, and base design system
- [ ] **Phase 2: Test Cases** - Keyboard-first test case editor, suite hierarchy, drag-drop reorder, bulk operations, CSV import
- [ ] **Phase 3: Test Runs and Dashboard** - Run creation, keyboard-driven execution, inline defect filing, live real-time dashboard
- [ ] **Phase 4: CI Ingestion** - JUnit XML and Allure JSON ingestion via REST API, R2 raw payload storage
- [ ] **Phase 5: Integrations and API** - Linear integration, REST API with full UI parity, outbound webhooks
- [ ] **Phase 6: Team and Access Control** - Workspace invitations, RBAC enforcement, plan tier limits

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/6 | In Progress | - |
| 2. Test Cases | 0/? | Not started | - |
| 3. Test Runs and Dashboard | 0/? | Not started | - |
| 4. CI Ingestion | 0/? | Not started | - |
| 5. Integrations and API | 0/? | Not started | - |
| 6. Team and Access Control | 0/? | Not started | - |

---

## Phase Details

### Phase 1: Foundation

**Goal**: The application is deployed, secured, and ready for features — CI/CD runs on every PR, the database schema covers all core entities, auth works end-to-end, workspace isolation is enforced at compile time and at the database layer, and the design system renders correctly in the browser.

**Depends on**: Nothing (first phase)

**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, DS-01, DS-02, DS-03, DS-04, WORK-01, WORK-02, WORK-03

**Success Criteria** (what must be TRUE when this phase completes):
1. A pull request to main triggers lint, type-check, and test jobs in GitHub Actions; a merge to main triggers an automatic Railway deploy
2. A new user can sign up, sign in, stay signed in across browser restarts, sign out from any screen, and reset a forgotten password via email
3. The Auth.js v5 session correctly carries workspace_id and role through the authorize → jwt → session callback chain — verified by an integration test that asserts both fields are present after sign-in
4. A user can create a workspace with a name/slug and create a project inside it; Free tier limits (3 editors, 1 project, 500 test cases) are schema-enforced
5. The design token set, typography scale, base components (Button variants, Card, Form Input, Status Badge), and collapsible sidebar all render correctly in the browser with no visual regressions

**Plans**: TBD

---

### Phase 2: Test Cases

**Goal**: A QA engineer can create a test case from blank to saved in under 30 seconds using only the keyboard, organise test cases into a nested suite tree, reorder everything via drag-and-drop, and bulk-manage cases across suites — including importing from CSV or Excel with step structure preserved.

**Depends on**: Phase 1

**Requirements**: TC-01, TC-02, TC-03, TC-04, TC-05, TC-06

**Success Criteria** (what must be TRUE when this phase completes):
1. A user can create a complete test case (title, preconditions, steps, expected results, priority) using only Tab and Enter — from a blank form to saved — in under 30 seconds
2. A user can add, reorder, and delete steps without touching the mouse; Tab moves to the next field, Enter adds a new step
3. A user can create nested suites of unlimited depth and move test cases into them; the sidebar tree reflects the hierarchy immediately
4. A user can drag and drop suites and test cases to reorder them; the reorder completes without a full-table rewrite (gap-based position integers)
5. A user can bulk-select test cases and move or copy them to a different suite in one action
6. A user can import a CSV or Excel file and see test cases created with step structure intact — not flattened to a single description field

**Plans**: TBD

---

### Phase 3: Test Runs and Dashboard

**Goal**: A QA engineer can create a named test run, execute it case-by-case using keyboard shortcuts, file defects inline from failures, and watch results update in real time on a live dashboard — without ever refreshing the page.

**Depends on**: Phase 2 (test cases must exist to create a run)

**Requirements**: TR-01, TR-02, TR-03, TR-04, TR-05, TR-06, TR-07, DA-01, DA-02, DA-03

**Success Criteria** (what must be TRUE when this phase completes):
1. A user can create a named test run scoped to a project, a suite selection, or a milestone, and assign it to a team member
2. A user can execute a run case-by-case using P/F/B/S keyboard shortcuts; pressing a key marks the result and advances to the next case without requiring a mouse click
3. A user can add an inline comment on any test step during execution without leaving the execution screen
4. A user can file a Linear issue directly from a failed run item and see the issue link appear in the run view
5. The run dashboard updates in real time as results are recorded — no page refresh required; the progress bar, pass rate percentage, and time-to-complete estimate all update live
6. A user can create a new run that contains only the failures from a previous run (rerun-failures flow)

**Plans**: TBD

---

### Phase 4: CI Ingestion

**Goal**: A CI pipeline can push automated test results to Velo via REST API and have them auto-mapped to test cases — supporting JUnit XML (five common CI variants) and Allure JSON — with raw payloads preserved in Cloudflare R2 for debugging.

**Depends on**: Phase 1 (REST API scaffold), Phase 3 (test runs must exist to receive ingested results)

**Requirements**: IN-01, IN-02, IN-03, IN-04

**Success Criteria** (what must be TRUE when this phase completes):
1. A CI pipeline can POST a JUnit XML file to the Velo API and see a test run created with results auto-mapped to test cases by name or external ID
2. A CI pipeline can POST an Allure JSON report to the Velo API and see results auto-mapped the same way
3. The JUnit XML parser handles results from pytest-junit, Maven Surefire, Gradle, Jest-junit, and Go gotestsum without returning a parse error
4. Raw CI payloads are stored in Cloudflare R2 and are not written to PostgreSQL; a developer can retrieve the raw payload for any ingestion run for debugging

**Plans**: TBD

---

### Phase 5: Integrations and API

**Goal**: The full REST API is available with parity to the UI, outbound webhooks fire on key events, and Linear is integrated so defects can be filed from failed run items and their status synced back into the run view.

**Depends on**: Phase 3 (runs and defect filing must exist for Linear integration and webhooks)

**Requirements**: INT-01, INT-02, INT-03, INT-04

**Success Criteria** (what must be TRUE when this phase completes):
1. A user can create a Linear issue directly from a failed run item in Velo; the issue link appears in the run view immediately
2. The current Linear issue status is visible in the Velo run view and stays in sync without manual refresh; an idempotency key prevents sync loops
3. Every resource readable and writable via the Velo UI is also readable and writable via the REST API with the same authorisation rules
4. A project admin can configure a webhook endpoint and verify that it receives a payload when a run completes, a case fails, or a milestone is reached

**Plans**: TBD

---

### Phase 6: Team and Access Control

**Goal**: A workspace admin can build and manage a team — inviting members by email, assigning roles, and deactivating access — with role-based permissions and plan tier limits enforced at the API layer so the product is safe to sell.

**Depends on**: Phase 1 (workspace and auth scaffold must exist)

**Requirements**: USR-01, USR-02, USR-03, USR-04, USR-05, USR-06

**Success Criteria** (what must be TRUE when this phase completes):
1. A workspace admin can invite a team member by email; the invited user receives an email with a sign-up/join link and lands in the correct workspace after accepting
2. A workspace admin can assign roles (Admin, Editor, Viewer) to each member; role changes take effect on the next request without requiring sign-out
3. A workspace admin can deactivate a team member; their session is invalidated immediately and they cannot access any workspace resource
4. Viewer seats are unlimited on all plan tiers; Editor seats are capped per tier and the API rejects editor-seat creation once the cap is reached
5. The Free tier limits (3 editors, 1 project, 500 test cases) are enforced at the API layer; a request that would exceed a limit returns a clear error with an upgrade prompt

**Plans**: TBD

---

## Coverage Map

| Requirement | Phase |
|-------------|-------|
| INFRA-01 | Phase 1 |
| INFRA-02 | Phase 1 |
| INFRA-03 | Phase 1 |
| INFRA-04 | Phase 1 |
| INFRA-05 | Phase 1 |
| INFRA-06 | Phase 1 |
| AUTH-01 | Phase 1 |
| AUTH-02 | Phase 1 |
| AUTH-03 | Phase 1 |
| AUTH-04 | Phase 1 |
| AUTH-05 | Phase 1 |
| DS-01 | Phase 1 |
| DS-02 | Phase 1 |
| DS-03 | Phase 1 |
| DS-04 | Phase 1 |
| WORK-01 | Phase 1 |
| WORK-02 | Phase 1 |
| WORK-03 | Phase 1 |
| TC-01 | Phase 2 |
| TC-02 | Phase 2 |
| TC-03 | Phase 2 |
| TC-04 | Phase 2 |
| TC-05 | Phase 2 |
| TC-06 | Phase 2 |
| TR-01 | Phase 3 |
| TR-02 | Phase 3 |
| TR-03 | Phase 3 |
| TR-04 | Phase 3 |
| TR-05 | Phase 3 |
| TR-06 | Phase 3 |
| TR-07 | Phase 3 |
| DA-01 | Phase 3 |
| DA-02 | Phase 3 |
| DA-03 | Phase 3 |
| IN-01 | Phase 4 |
| IN-02 | Phase 4 |
| IN-03 | Phase 4 |
| IN-04 | Phase 4 |
| INT-01 | Phase 5 |
| INT-02 | Phase 5 |
| INT-03 | Phase 5 |
| INT-04 | Phase 5 |
| USR-01 | Phase 6 |
| USR-02 | Phase 6 |
| USR-03 | Phase 6 |
| USR-04 | Phase 6 |
| USR-05 | Phase 6 |
| USR-06 | Phase 6 |

**Total: 48/48 requirements mapped. No orphans.**

---

## Key Architecture Notes

- **Phase 1 is strictly sequential:** CI/CD → schema → Valkey → auth → workspace middleware → design system. Each step gates the next.
- **Phases 2-6 are parallelisable** once Phase 1 is stable. Test cases (Phase 2), runs/dashboard (Phase 3), ingestion (Phase 4), integrations (Phase 5), and RBAC (Phase 6) are independent delivery tracks.
- **Real-time transport:** SSE + Valkey pub/sub per run_id. Not WebSocket. Test SSE on Railway URL in week 1 of Phase 3.
- **Data access:** postgres.js raw SQL for all runtime queries. Drizzle ORM for schema definition and drizzle-kit for migration generation only.
- **Multi-tenancy:** App-layer workspace_id enforcement (compile-time) + PostgreSQL RLS with SET LOCAL (transaction-scoped) as defense-in-depth.
- **Steps storage:** Normalized test_case_steps table, not JSONB.

---

*Roadmap created: 2026-03-08*
*Last updated: 2026-03-08 after plan 03 (Valkey + BullMQ)*
