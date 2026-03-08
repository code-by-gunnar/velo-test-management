# Feature Landscape: QA Test Management Platforms

**Domain:** QA / Test Case Management SaaS
**Target segment:** Startups, 20-200 employees
**Researched:** 2026-03-08
**Confidence note:** WebSearch and WebFetch unavailable this session. All findings derived from training knowledge (cutoff Aug 2025) covering TestRail, Qase, PractiTest, Xray, qTest, Zephyr, and Allure TestOps. Marked LOW confidence where specific version or pricing details may have drifted.

---

## Table Stakes

Features that users expect in any test management tool. Missing = product feels broken or incomplete. Users will not subscribe.

| Feature | Why Expected | Complexity | Notes for Velo |
|---------|--------------|------------|----------------|
| Test case create/edit/delete | Core CRUD — the product | Low | P0 TC-01. Non-obvious: keyboard-nav and inline editing are what users actually want — most tools force modal dialogs |
| Test suite / folder hierarchy | Organise by feature, module, sprint | Low-Med | P0 TC-02. Users expect at minimum 2 levels deep; 4+ levels preferred |
| Manual test execution (pass/fail/blocked/skip) | The daily job of a QA engineer | Low-Med | P0 TR-02. Non-obvious: "blocked" and "skip" are must-have statuses — tools that only offer pass/fail feel half-finished |
| Test run creation from suite/filter | How work is assigned and tracked | Med | P0 TR-01. Users expect ability to pick individual cases, not just entire suites |
| Execution result history per test case | "Has this ever passed?" is a daily question | Med | Missing this = users go back to spreadsheets |
| Basic reporting (pass rate, run summary) | Required for standups and sign-off | Med | Pie chart / summary table minimum. Trend over time is P1 |
| Role-based access control | Enterprise procurement requires it; SOC 2 auditors check it | Med | P0 USR-01. Minimum: Admin, QA Lead, Tester, Read-only |
| Team / user management | Multi-person teams from day 1 | Low | P0 USR-01. Invite by email, deactivate users |
| Search and filter on test cases | Suites grow to 1000+ cases fast | Med | Full-text search + filter by status, label, owner, priority |
| Bulk operations on test cases | Moving/tagging 50 cases at once | Med | Bulk edit, bulk move, bulk delete. Often poorly implemented |
| Priority / severity field on test cases | Teams triage; PMs ask "how many high-priority tests failed?" | Low | Enum field: Critical, High, Medium, Low |
| Test case steps (structured) | Step-by-step instructions are the format QA engineers write in | Low | Expected and/or action + expected result per row |
| Assign test cases to runners | Who is running what | Low | Drop-down on run item; shows in runner's queue |
| REST API | Automation engineers need to push results and pull data | Med | P0 API-01. Without this, automation teams build their own dashboards |
| JUnit XML ingestion | CI/CD outputs JUnit XML — this is the lingua franca | Med | P0 IN-01. Every tool supports this; absence is a dealbreaker for engineering teams |
| Jira integration (at least one-way) | Bug filing from test failures | High | P0 INT-01. Two-way (test result on Jira issue) is differentiating; one-way (create Jira from failure) is table stakes |
| Attachment support (screenshots, logs) | Evidence of failures | Low | File upload on test result; S3/blob storage behind the scenes |
| Test case versioning / audit log | "Who changed this test and when?" | Med | Lightweight: created_by, updated_by, updated_at. Full diff history is differentiating |

---

## Differentiators

Features not universally expected, but that drive purchase decisions and retention. This is where Velo should compete.

| Feature | Value Proposition | Complexity | Notes for Velo |
|---------|-------------------|------------|----------------|
| Real-time run dashboard (no refresh) | Solves the #1 pain point: stale data during live test runs | High | P0 DA-01. WebSocket/SSE push. TestRail requires manual refresh; Qase is near-realtime but not instant. This is a genuine gap |
| Keyboard-first test case editor | Speed: under 30s from blank to saved | Med | P0 TC-01. Tab through fields, Enter to add step, Ctrl+S to save. No modals. Most competitors are click-heavy form UIs |
| Sub-30-second test case creation | Removes the reason teams skip documenting tests | Med | Combination of keyboard-first + no required fields except title |
| CSV/Excel import that actually works | Every team has a spreadsheet backlog | Med | P0 TC-01. Most tools import only title, not steps. Velo should import steps as rows |
| Allure JSON ingestion | Allure is dominant in Java/Kotlin/Python shops | Med | P0 IN-01. Qase supports it; TestRail does not natively. Differentiating for engineering-led teams |
| Webhooks (outbound) | Teams build Slack bots, PagerDuty triggers, custom dashboards | Med | P0 API-01. Often absent or broken in cheaper tools |
| AI test case generation (from spec or description) | 10x speed when writing new test suites | High | P1 in spec. Genuinely differentiating in 2025 — only Qase and a few others have this. Do not ship it half-baked |
| Coverage reports (test cases vs. requirements) | Engineering managers want traceability | High | P1 in spec. Requires linking test cases to requirements/stories. Complex to model correctly |
| Trend charts (flakiness, pass rate over time) | Identifies deteriorating test suites | Med | P1 in spec. Low implementation complexity if data is already stored; high if schema not designed for it from day 1 |
| GitHub/GitLab integration | Trigger runs on PR; link failure to commit | High | P1 in spec. Differentiating for engineering-first teams. Requires OAuth + webhook receiver |
| Slack notifications | Run complete, new failure alerts | Med | P1 in spec. Expected by 2025 but many tools charge per-integration add-on |
| Flakiness detection | Automatically flags tests that pass/fail inconsistently | High | Not in spec. High-value for mature QA orgs. Requires statistical tracking over run history |
| Execution time tracking | Identifies slow test cases for parallelisation | Low | Store duration on automated results; surface in reports |
| Custom fields on test cases | Teams have domain-specific metadata | Med | TestRail's biggest selling point for enterprise. For startups: offer 3-5 fixed custom fields, not a full schema builder |
| Test plan (milestones) | Release sign-off tracking across multiple runs | Med | TestRail's "test plan" concept. Useful for teams with formal release cycles. Overkill for early startups |
| Parametrised / data-driven test cases | One test case, multiple data sets | High | Xray's territory. Complex to implement correctly. Not in spec, defer post-PMF |
| AI failure analysis | "Why did this test fail?" with LLM reasoning | High | P2 in spec. Genuinely novel. Only Allure TestOps has a prototype. High differentiation potential |

---

## Anti-Features

Features to deliberately not build, at least for the target segment.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Visual / screenshot testing built-in | Entire separate product category (Percy, Applitools). Adds infrastructure complexity; 0-200 employee teams don't need it native | Webhook/API so Applitools can push results in |
| Test execution scheduling / orchestration | CI/CD tools (GitHub Actions, Jenkins) already do this. Building a scheduler creates a competing product surface area | Ingest results from wherever CI runs them |
| No-code test recorder / Selenium IDE | Low-code test tools (Playwright Codegen, Katalon) are specialist products. Conflation confuses the ICP | Integrate with those tools via result ingestion |
| Requirement management (full) | Jira owns this for target customers. Building requirement trees duplicates Jira Epic/Story hierarchy | Support linking test cases to Jira issues |
| Time tracking / test effort estimation | Project management feature creep. QA managers in 20-200 person companies do not need this in their test tool | Not a priority; defer indefinitely |
| Custom workflow states (beyond P/F/B/S) | Adds configuration surface, slows onboarding. The four statuses cover 95% of cases | Offer "Retest" as an optional 5th status if requested, nothing more |
| Multi-project / workspace federation | Enterprise consolidation feature. Complicates billing, permissions, and data isolation for startup customers | One project hierarchy per account; keep it simple |
| Built-in CI/CD runner | Competing with GitHub Actions, CircleCI, etc. | Deep integrations, not replacement |
| Proprietary automation framework | Forces vendor lock-in; developers refuse to adopt | Standard JUnit XML, Allure JSON, REST API |

---

## P0 Feature Implementation Notes

These are features already in the spec (P0) that have non-obvious correct implementations based on how competitors have gotten them wrong.

### TC-01: Test Case Editor
- **Non-obvious:** The speed target (under 30s) requires zero required fields except title on creation. All metadata (priority, labels, steps) should be addable after the first save. Forcing users through a multi-field form before save is the reason TestRail is slow.
- **Non-obvious:** "Steps" must be keyboard-navigable. Tab from action to expected result, Enter to add a new step row. Clicking to add each step is the single biggest time sink in TestRail.
- **Non-obvious:** CSV import must preserve step structure. Parse columns as: title, preconditions, step_action, step_expected. Most tools flatten steps to a single "description" column, which makes import useless.

### TC-02: Suite & Folder Structure
- **Non-obvious:** Drag-and-drop reordering requires a `position` / `order` field per node. If this is not in the schema from day 1, retrofitting it is painful. Use a float-based ordering (LexoRank or simple float) to avoid full-table re-indexing on every reorder.
- **Non-obvious:** Users want to move test cases between folders without losing their result history. The test case ID must be stable across moves.

### TR-01: Test Run Creation
- **Non-obvious:** Users frequently want to re-run only failed tests from a previous run. This is "rerun from run" — a specific selection mode, not just filtering. TestRail supports it; many cheaper tools do not. Include from day 1 or it will be a top support request.

### TR-02: Execution Interface
- **Non-obvious:** The P/F/B/S keyboard shortcuts must work without focus on a specific element (or with a clearly visible focus state). Most tools implement them as button clicks; keyboard users find this on their own and then expect it always. Ship the shortcuts in onboarding.
- **Non-obvious:** Testers need to see the previous result alongside the current execution slot. "Last run: Failed (3 days ago)" prevents re-running already-known-bad tests as if they are fresh.

### IN-01: Automated Result Ingestion
- **Non-obvious:** JUnit XML has no standard schema — it is a de facto standard with variants (Surefire, pytest-junit, etc.). Key variations: multiple `<testsuites>` root vs. single `<testsuite>`, `classname` attribute population, `time` attribute presence. Must handle all variants without erroring.
- **Non-obvious:** Automated results need a "matcher" strategy — how does an uploaded result get matched to a test case in Velo? Options: by name, by custom ID attribute in XML, by suite path. Decide this early; it affects the automation integration contract published in the API docs.
- **Non-obvious:** Allure JSON is a directory of per-test JSON files, not a single file. The ingestion endpoint should accept a `.zip` of the allure-results directory or individual files with a run ID correlation.

### DA-01: Live Run Dashboard
- **Non-obvious:** Real-time requires either WebSockets or Server-Sent Events (SSE). SSE is simpler to implement and sufficient for this use case (one-directional: server pushes updates). WebSockets add bidirectional overhead that is not needed here.
- **Non-obvious:** The dashboard must handle concurrent runners updating the same run. Optimistic UI + server authority on conflict. Race conditions on pass/fail counts are a common bug when two testers click at the same time.

### INT-01: Jira Integration
- **Non-obvious:** Two-way sync has a sync loop risk — Velo updates Jira, Jira webhook fires, Velo tries to update again. Must use a "source of write" flag or idempotency check on webhook receipt.
- **Non-obvious:** Jira's custom field schema varies per instance. Do not assume field names; use Jira's REST API to discover the issue type and field schema at connection time. Hard-coding "Bug" as the issue type will break for customers who have renamed it.

### API-01: REST API & Webhooks
- **Non-obvious:** API keys are the expected auth for automation; OAuth is for integrations. Offer both. Single token per user is insufficient — teams need service account tokens not tied to a person who might leave.
- **Non-obvious:** Webhook delivery must have retry with exponential backoff and a dead letter log. Teams need to see "this webhook failed 3 times to https://..." to debug their receivers.

### USR-01: Team & Role Management
- **Non-obvious:** The minimum viable role set for a startup QA tool is: Owner, Admin, Member (can create/edit/run), Viewer (read-only). Do not build a full RBAC permission matrix — it adds onboarding friction and support burden. Named roles are sufficient for the target segment.

---

## Feature Dependencies

```
USR-01 (Users/Roles) → everything else (auth gate)

TC-02 (Suite Structure) → TC-01 (Test Cases must live somewhere)
TC-01 (Test Cases) → TR-01 (Run Creation draws from cases)
TR-01 (Test Run) → TR-02 (Execution needs a run to write to)
TR-02 (Execution Results) → DA-01 (Dashboard reads live results)

IN-01 (Result Ingestion) → TR-01 (Creates or updates a run)
IN-01 (Result Ingestion) → DA-01 (Automated results show in dashboard)

API-01 (REST API) → IN-01 (Ingestion is an API endpoint)
API-01 (REST API) → INT-01 (Jira integration calls Jira API and receives webhooks)

INT-01 (Jira) → TC-01 (Links test cases to Jira issues)
INT-01 (Jira) → TR-02 (Create Jira bug from failed execution)

DA-01 (Live Dashboard) → TR-01 + TR-02 (No run = nothing to display)

--- P1 dependencies ---
Templates → TC-01 (Templates are saved test case shells)
Coverage Reports → INT-01 + TC-01 (Requires Jira issue links on test cases)
Trend Reports → TR-02 result history (Need ≥30 days of run data to be meaningful)
GitHub/GitLab → API-01 (OAuth + inbound webhook → triggers run or ingests result)
Slack → API-01 + DA-01 (Notify on run complete event)
AI Generation → TC-01 (Output is a test case; requires stable editor API)

--- P2 dependencies ---
AI Failure Analysis → IN-01 + TR-02 (Needs automated result logs and stack traces)
Custom Dashboards → DA-01 + reporting data model
```

---

## MVP Recommendation

**Prioritise (matches P0 spec — validated by this research):**

1. TC-01 + TC-02: Without fast, keyboard-first case creation, Velo has no reason to exist for the target user
2. TR-01 + TR-02: A test case tool without execution is a glorified spreadsheet; execution closes the loop
3. IN-01 (JUnit XML first, Allure second): Engineering teams will not adopt a tool that requires manual result entry
4. DA-01: Real-time dashboard is the primary differentiator — ship it at launch, not as a later add-on
5. USR-01: Needed before any team trial converts to paid
6. API-01 + INT-01: Required for procurement sign-off at even 20-person companies

**Defer from P0 (not in spec, confirm these stay deferred):**
- Flakiness detection: High value but requires 90+ days of run history to be meaningful — build the data model now, surface the UI at 6 months
- Custom fields: Add after first 20 customers give feedback on what metadata they actually track; do not design in a vacuum
- Test plans / milestones: Only relevant to teams with formal release sign-off processes; most startups in the ICP do not have this yet

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Table stakes features | MEDIUM-HIGH | Based on training knowledge of TestRail, Qase, PractiTest, Xray. Core feature set is stable and unlikely to have changed significantly since Aug 2025 |
| Differentiators | MEDIUM | AI features evolving fast; real-time dashboard gap assessment based on known TestRail/Qase state as of mid-2025. Verify Qase's real-time status before using in marketing |
| Anti-features | HIGH | These are structural product strategy decisions grounded in ICP, not technology — highly stable |
| P0 implementation notes | HIGH | Based on well-documented pain points in the test management space (TestRail community forums, migration threads, user interviews widely published). These are stable engineering realities |
| Competitor pricing | LOW | Verify current pricing before using in any positioning document — SaaS pricing changes frequently |

---

## Sources

- Training knowledge: TestRail documentation and community (testrail.com, testrail-users Slack, migration guides)
- Training knowledge: Qase.io feature set and changelog (as of mid-2025)
- Training knowledge: PractiTest, Xray for Jira, qTest/Tricentis feature comparisons
- Training knowledge: Allure TestOps AI feature announcements (2024-2025)
- Training knowledge: JUnit XML schema variants (Apache Surefire documentation, pytest-junit plugin docs)
- Training knowledge: Jira REST API field discovery patterns (Atlassian developer docs)
- NOTE: WebSearch and WebFetch unavailable during this research session. All findings from training data. Recommend verifying competitor feature pages (testrail.com/features, qase.io/features) before finalising roadmap decisions.
