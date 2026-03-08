# Domain Pitfalls: QA Test Management SaaS

**Domain:** QA test management platform (startup-focused, real-time, CI/CD ingestion)
**Researched:** 2026-03-08
**Confidence note:** WebSearch and WebFetch were unavailable in this session. All findings derive from training knowledge (cutoff August 2025) applied to the specific project context. Confidence levels reflect depth of technical grounding, not external source verification. Flag MEDIUM/LOW items for manual review before implementation.

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or product-killing UX problems.

---

### Pitfall C1: JSONB steps[] becomes a query dead-end

**What goes wrong:** Storing test case steps as a JSONB array (`steps: [{action, expected, order}]`) feels convenient at schema design time. It works fine for single-case reads. It becomes a dead-end when you need to: search within steps, run bulk reordering, copy steps between cases, generate coverage reports by step type, or let CI results map to individual steps. Every one of these requires either a full table scan + application-side filtering or a complete JSONB schema change later.

**Why it happens:** The "denormalize early" instinct is strong when building fast. Steps feel like an atomic part of a test case, not first-class entities. Early prototypes feel snappy with JSONB.

**Consequences:**
- Step-level CI result mapping (which Allure JSON supports) becomes impossible without a migration
- `steps[]` can grow unbounded — a test case with 200 steps is a 200-element JSON blob fetched on every list query
- Adding step-level comments, attachments, or execution history requires another migration
- `ORDER BY` on steps requires `jsonb_array_elements` which is slow at scale

**Prevention:** Model steps as a separate `test_case_steps` table from day one:
```sql
test_case_steps (id, test_case_id, order_index, action, expected_result, created_at)
```
JSONB is appropriate for: custom fields, metadata blobs, CI report raw payloads. It is not appropriate for structured data you will need to query or join.

**Warning signs:** "We just need a simple array for now" in any planning discussion.

**Phase:** Address in Phase 1 (schema design). Migrating after data exists is painful.

**Confidence:** HIGH — this is a well-documented PostgreSQL modeling trap.

---

### Pitfall C2: Multi-tenancy row-level isolation breaks silently

**What goes wrong:** Every query needs a `workspace_id` filter. The app works correctly in tests because the test user only has one workspace. In production, a missing `WHERE workspace_id = $1` on any query leaks data between workspaces. This is catastrophic for a SaaS product and often invisible until a specific user action exposes it.

**Why it happens:** Developers add `workspace_id` to tables but rely on application-layer filtering. As the codebase grows, new queries skip the filter. This is especially common in aggregate queries (dashboard stats, coverage reports) where developers focus on the aggregation logic and forget the scope.

**Consequences:** Data leakage between paying customers. Regulatory exposure. Loss of trust that ends the product.

**Prevention (layered approach):**

1. **PostgreSQL Row-Level Security (RLS):** Enable RLS on all tenant-scoped tables. Set `app.current_workspace_id` via `SET LOCAL` at the start of every request. RLS policies enforce the filter at the DB level regardless of what the application does.
   ```sql
   ALTER TABLE test_cases ENABLE ROW LEVEL SECURITY;
   CREATE POLICY workspace_isolation ON test_cases
     USING (workspace_id = current_setting('app.current_workspace_id')::uuid);
   ```
2. **Repository layer pattern:** All DB queries go through workspace-scoped repository classes that inject `workspace_id` automatically. No raw queries in route handlers.
3. **Integration test per entity:** At Phase 2 completion, add a test that creates two workspaces, populates both, and asserts that user of workspace A cannot retrieve workspace B's data via any API endpoint.

**Warning signs:** Route handlers querying `test_cases` without a `workspace_id` param. Any `SELECT *` not going through a repository abstraction.

**Phase:** Phase 1 (schema + middleware). The RLS setup costs 2-4 hours up front and prevents a potential company-ending bug.

**Confidence:** HIGH.

---

### Pitfall C3: Real-time WebSocket/SSE on Railway loses connections under load

**What goes wrong:** Railway's networking infrastructure terminates long-lived HTTP connections after ~60-90 seconds by default. WebSocket connections behind Railway's proxy may be silently dropped. The SSE stream appears to work in local dev (no proxy) but drops every 60-90 seconds in production, causing the "real-time" dashboard to go stale — exactly the problem Velo claims to solve.

**Why it happens:** Railway uses a reverse proxy layer. Long-lived connections (WebSocket upgrades, SSE streams) depend on proxy configuration that Railway doesn't expose for custom tuning at the Starter/Hobby tier. This is a common gotcha for developers who test locally without a proxy.

**Consequences:** The core differentiator (live run dashboard, no page refresh) silently breaks in production. Fallback to polling defeats the purpose. Users churn.

**Prevention:**

1. **Test on Railway in a staging environment before Phase 2 ends.** Open a WebSocket/SSE connection through the Railway URL and leave it open for 5 minutes. If it drops, you know immediately.
2. **Build a client-side reconnection strategy regardless.** SSE clients should reconnect with exponential backoff. The `EventSource` API auto-reconnects by default, but you need to re-subscribe to the correct run state on reconnect (send last-known sequence or timestamp).
3. **SSE over WebSocket for this use case.** SSE is HTTP/1.1 compatible, passes through proxies more reliably than WebSocket upgrades, and is sufficient for one-directional dashboard updates. Prefer SSE for run status streaming; only use WebSocket if bidirectional is required.
4. **Heartbeat pings every 20 seconds.** SSE servers should emit a `:ping` comment every 20s to keep connections alive through proxies.
5. **Railway egress timeout docs:** Review Railway's current connection timeout docs before Phase 2. If timeout is configurable, set it to 300s+.

**Warning signs:** SSE works in `localhost:3000` but test on `railway.app` domain shows connections dropping after ~60s.

**Phase:** Phase 2 (real-time dashboard). Test on Railway infrastructure, not just locally.

**Confidence:** MEDIUM — Railway's proxy behavior is known to cause issues for SSE/WS; specific timeout values may change. Must verify against current Railway docs.

---

### Pitfall C4: JUnit XML schema variation breaks the ingestion parser

**What goes wrong:** "JUnit XML" is not a standard — it is a de facto format with no normative spec. Every CI tool produces a different variant. A parser built against pytest's output will silently drop data from Maven Surefire, Gradle, Jest-junit, or Go's test2json JUnit reporter. Allure JSON has better structure but still has version differences.

**Known variations that break naive parsers:**

| CI Tool / Framework | Common Divergences |
|---|---|
| pytest (pytest-junit) | `classname` = module path, nested `<testsuites>` wrapper sometimes absent |
| Maven Surefire | `<properties>` elements, `<system-out>` CDATA blocks, `time` as float or int |
| Gradle | Multiple `<testsuite>` elements in one file, no root `<testsuites>` |
| Jest-junit | `ancestorTitles` in `classname`, custom `title` attribute |
| Go (gotestsum) | `<testcase>` without `classname`, suite name = package path |
| Playwright | `<failure>` may contain structured JSON as text content |
| NUnit (C#) | Completely different schema — `<test-run>` not `<testsuites>` |
| PHPUnit | `<testsuite>` nesting differs, `assertions` attribute not universal |
| Xcode (xcodebuild) | Non-standard attributes, Unicode in test names |

**Consequences:** CI ingestion silently drops test results. Engineers assume the tool is broken and stop using the integration — the integration becomes a dead feature.

**Prevention:**

1. **Never assume a root `<testsuites>` wrapper.** Handle both `<testsuite>` as root and `<testsuites>` containing `<testsuite>` elements.
2. **Treat all numeric attributes as strings first.** `time="1.234"`, `time="1"`, and `time=""` all appear in the wild.
3. **Never throw on unexpected attributes or elements.** Parsers must be lenient (Postel's law).
4. **Test against fixture files from each major CI platform.** Create a `fixtures/junit/` directory with real-world XML samples from: pytest, Maven Surefire, Gradle, Jest-junit, Go gotestsum. Run parser unit tests against all of them before shipping the integration.
5. **Store the raw payload.** Persist the original XML/JSON in R2 before parsing. If parsing fails or is incorrect, re-parse from the stored raw payload without data loss.
6. **Return a parse receipt.** The ingestion API should return: total tests found, tests parsed successfully, tests skipped (reason), warnings. Engineers need to know if their upload was partially ingested.

**Warning signs:** Parser only tested against one framework's output. No fixture files checked in.

**Phase:** Phase 2 (CI ingestion). Build the fixture library before writing the parser, not after.

**Confidence:** HIGH — JUnit XML schema variation is extremely well-documented as a real-world pain point in CI tooling.

---

### Pitfall C5: Auth.js v5 credentials provider + JWT sessions have sharp edges

**What goes wrong:** Auth.js v5 (formerly NextAuth) changed its API significantly from v4. The credentials provider with JWT sessions — which is the correct choice here since there is no OAuth provider — requires explicit configuration that is easy to misconfigure. Common mistakes: session data not persisting custom fields (workspace_id, role) across requests; JWT secret rotation invalidating all active sessions silently; `authorized()` callback in middleware not covering API routes.

**Specific v5 traps:**

1. **`callbacks.jwt()` must explicitly forward custom fields.** If you add `workspaceId` to the user object returned by `authorize()`, you must also forward it in `callbacks.jwt()` and `callbacks.session()` or it disappears from `getServerSession()`.
2. **`authorized()` in `auth.config.ts` only protects pages by default.** API routes under `/api/` are not automatically protected unless the matcher in `middleware.ts` explicitly includes them.
3. **Database sessions vs JWT sessions have different invalidation semantics.** JWT sessions cannot be revoked server-side without a blocklist. For a SaaS product with user deletion and team management, this matters: a removed team member's JWT remains valid until expiry.
4. **`NEXTAUTH_SECRET` vs `AUTH_SECRET`.** v5 uses `AUTH_SECRET`. Projects migrating from v4 docs or tutorials may set `NEXTAUTH_SECRET` and get silent fallback behavior.
5. **Edge runtime incompatibility.** If any middleware runs on the Edge runtime and uses a database adapter, it will fail at runtime (not build time). Pages Router + Node runtime avoids this, but it is easy to accidentally enable Edge for a route.

**Prevention:**

1. Write an integration test that calls `GET /api/protected-endpoint` with no session token and asserts 401. Do this for every protected API route family.
2. For team member removal: implement a `sessions` blocklist table (or use Valkey TTL keys) to invalidate JWT sessions server-side immediately.
3. Pin to a specific Auth.js v5 minor version and review the changelog before upgrading.
4. Test session persistence: log in, add `workspaceId` to session, restart the server (to flush any in-memory state), and verify `workspaceId` is still present in the next request's session.

**Warning signs:** `console.log(session)` in a handler shows fields that were set in `authorize()` but are undefined. Middleware only covers `/` and not `/api/`.

**Phase:** Phase 1 (auth foundation). Getting this right before building anything on top of it saves significant rework.

**Confidence:** MEDIUM — Auth.js v5 was in beta/RC through much of 2024 and its API surface changed frequently. Some specifics may differ in the stable release. Verify against current Auth.js v5 docs before implementation.

---

## Moderate Pitfalls

Mistakes that cause significant rework but not full rewrites.

---

### Pitfall M1: "Under 30 seconds" UX fails because of sequential round trips

**What goes wrong:** The "create test case in under 30 seconds" requirement is a UX commitment, not just a performance target. The most common failure mode is not slow database queries — it is too many sequential round trips. Creating a test case that requires: (1) load suite tree, (2) select suite, (3) open editor, (4) type content, (5) save, (6) wait for validation response, (7) navigate back — is 30+ seconds of interaction time even with fast APIs.

**Prevention:**

1. **Optimistic UI updates.** Write the test case to local state immediately on save. Sync to server in background. Show a soft "saving..." indicator rather than blocking the UI.
2. **Keyboard-first means no modal dialogs.** Modals interrupt the creation flow. Inline editors (like Notion's slash commands) are faster.
3. **Pre-select the current suite context.** If the user is in a suite, a new test case should default to that suite — no selection required.
4. **Measure actual time, not perceived time.** In Phase 2, add a manual timing test: start a stopwatch when opening a blank project, stop it when the test case appears in the list. Target 25 seconds to leave 5s margin.

**Warning signs:** New test case creation requires navigating to a suite first (separate page/modal). Save button triggers navigation away from the editor.

**Phase:** Phase 2 (test case editor).

**Confidence:** HIGH — this is a UX design pattern issue independent of technology choices.

---

### Pitfall M2: Performance cliff at 1,000+ test cases from missing pagination and indexes

**What goes wrong:** A project with 50 test cases feels fast. At 1,000+ test cases (realistic for a startup's regression suite after 12 months), `SELECT * FROM test_cases WHERE project_id = $1` returns a large result set and the suite tree rendering becomes slow. This is not a hypothetical — most QA tools get complaints about slowness specifically when projects mature.

**Prevention:**

1. **Add indexes before there is data.** At minimum: `(project_id, suite_id)`, `(project_id, created_at)`, `(workspace_id, project_id)`, `(status)` for run items.
2. **Paginate the test case list from day one.** Cursor-based pagination (not offset) is better for large lists where items are frequently inserted. The UI should load 50-100 cases at a time with a "load more" or virtual scroll.
3. **Suite tree is not a flat list.** Load the suite structure (names, IDs, counts) separately from the test case content. A user browsing suites should not trigger a fetch of all test case bodies.
4. **`EXPLAIN ANALYZE` every query** before shipping Phase 2. Add this as a checklist item in the PR template.

**Warning signs:** API endpoint returns all test cases in a project without a `LIMIT` clause. Suite tree query joins `test_cases` to get counts without a pre-aggregated counter.

**Phase:** Phase 1 (schema, indexes) and Phase 2 (API pagination).

**Confidence:** HIGH.

---

### Pitfall M3: Flat pricing model breaks without editor seat enforcement

**What goes wrong:** "Flat workspace pricing" sounds simple but requires enforcement logic that is easy to under-specify. If the Starter tier allows 10 editors and a workspace reaches 11, the 11th invite must be blocked — but edge cases proliferate: What if a user is invited and doesn't accept? Does a pending invite count? What if an editor is downgraded to Viewer — does that free a seat? What if the workspace is on a Grace period after a failed payment?

**Prevention:**

1. **Define seat counting rules explicitly before building the billing system.** Write them as a spec comment in the database schema:
   - "Active editors" = `workspace_members` with `role IN ('admin', 'editor')` and `status = 'active'`
   - Pending invites do NOT count toward seat limits (reduces conversion friction)
   - Viewers are always free (never count)
2. **Enforce at the invitation acceptance step, not the invitation send step.** This prevents the invite-10-people-simultaneously loophole from mattering until the last moment.
3. **Add a `seats_used` counter column to `workspaces`** rather than computing it at invite time. Update it via trigger or application logic on membership changes. Never compute live for every invite check.

**Warning signs:** Seat count logic scattered across multiple API handlers. No database-level constraint on editor count.

**Phase:** Phase 1 (schema) and Phase 2 (team management).

**Confidence:** HIGH — billing edge cases are a well-known SaaS gotcha.

---

### Pitfall M4: Valkey pub/sub fan-out does not scale past a single API process

**What goes wrong:** The real-time dashboard works perfectly with one Fastify process. When Railway scales to two or more instances (or a deploy creates a brief overlap of old and new instances), Valkey pub/sub events published by one process are not delivered to clients connected to a different process. Clients on the "wrong" instance miss run updates.

**Prevention:**

1. **Use Valkey pub/sub with a per-channel fan-out pattern from day one.** Each run has a channel (`run:{runId}:events`). The API process subscribes all SSE clients for that run to that Valkey channel. This works correctly across multiple processes because all processes subscribe to the same Valkey channel.
2. **For MVP (single Railway instance):** this is not an immediate problem, but the pub/sub architecture should be built correctly even for one process, because scaling later is a config change, not a code change.
3. **Test with two concurrently running API servers** locally before considering the architecture "correct."

**Warning signs:** Run status updates are stored in process memory (e.g., a Node.js `EventEmitter`) rather than published to Valkey. SSE connections keyed by process-local state.

**Phase:** Phase 2 (real-time dashboard). Design the pub/sub correctly, not as an afterthought.

**Confidence:** HIGH — this is a standard distributed systems pitfall for SSE/WebSocket architectures.

---

### Pitfall M5: Test run status becomes inconsistent during concurrent updates

**What goes wrong:** A test run has a computed `status` (In Progress, Passed, Failed, Blocked) that derives from the status of all its `run_items`. When two engineers execute tests concurrently (one marking cases Passed, one marking cases Failed), the run-level status can get out of sync with the actual item states if updated naively.

**Prevention:**

1. **Do not store computed run status as a writable column that any handler updates.** Instead: store raw `run_items` statuses, and compute run-level status either (a) via a PostgreSQL computed column or view, or (b) via a background job that recomputes after each item update.
2. **Use PostgreSQL advisory locks or optimistic concurrency** on `run_items` updates. For a run with 100 items, two concurrent updates to different items should not conflict — but updates to the same item should serialize.
3. **Emit the run status recomputation event to Valkey** after every `run_item` update so the dashboard reflects the new aggregate.

**Warning signs:** Route handler for "mark test as passed" also writes to `test_runs.status` without checking all other items.

**Phase:** Phase 2 (test execution).

**Confidence:** HIGH.

---

## Minor Pitfalls

Mistakes that cause friction, user complaints, or tech debt but are recoverable.

---

### Pitfall Mi1: "3 clicks to any data" breaks on nested suite structures

**What goes wrong:** The navigation rule (max 3 clicks) conflicts with deeply nested suite structures. A suite tree with 4+ levels of nesting is common in mature QA projects. If reaching a test case requires: (1) click workspace, (2) click project, (3) click parent suite, (4) click child suite, (5) click test case — that's 5 clicks, violating the constraint.

**Prevention:**
- The "3 clicks" rule must be measured from any screen, not from the homepage. From inside a project, navigating to any test case in that project should take ≤2 clicks.
- Breadcrumbs are necessary. Global search is necessary (Phase 3+ per scope, but plan for it).
- Suite tree should be a persistent left panel, not a page-to-page navigation flow.

**Phase:** Phase 2 (navigation design).

**Confidence:** HIGH.

---

### Pitfall Mi2: Allure JSON report format changes between Allure versions

**What goes wrong:** Allure JSON schema evolved between Allure 2.x versions. The `attachment`, `step`, and `label` structures differ. A parser built against Allure 2.13 output may silently fail on 2.21 output.

**Prevention:**
- Store raw Allure JSON in R2 before parsing (same strategy as JUnit XML).
- Include fixtures from Allure 2.13, 2.18, and 2.21+ in the test fixture library.
- Parse defensively: check for field presence before accessing, never assume array elements exist.

**Phase:** Phase 2 (CI ingestion).

**Confidence:** MEDIUM — Allure versioning behavior based on training data; verify against current Allure release notes.

---

### Pitfall Mi3: Railway cold starts create a confusing first-load experience

**What goes wrong:** Railway Hobby/Starter tier services can cold-start (spin down when idle). A QA engineer who opens the dashboard after it has been idle gets a 10-30 second first load. This feels like the product is broken, especially for a product promising sub-300ms responses.

**Prevention:**
- Configure Railway's "Always On" (or equivalent) for the backend service even at MVP stage.
- Add a loading state to the frontend that distinguishes "server waking up" from "error."
- Alternatively: use a health-check endpoint to ping the backend on app init and show a "connecting..." state rather than a blank page.

**Phase:** Phase 1 (deployment setup).

**Confidence:** MEDIUM — Railway's sleep behavior depends on plan tier; verify current Railway plan docs.

---

### Pitfall Mi4: Keyboard shortcuts conflict with browser and OS defaults

**What goes wrong:** A keyboard-first UX requires custom keyboard shortcuts. Shortcuts like `Cmd+P` (pass), `Cmd+F` (fail) conflict with browser's built-in Print and Find. Global shortcuts using `Ctrl` or `Cmd` are especially dangerous. Users on macOS and Windows have different expectations.

**Prevention:**
- Use `F`/`P`/`B`/`S` as single-key shortcuts when the editor is not focused (modal/overlay context). Do not use modifier keys for the primary execution shortcuts.
- Disable shortcuts when any text input is focused.
- Publish a keyboard shortcut reference accessible via `?` key.
- Test shortcuts on both macOS and Windows before Phase 2 ships.

**Phase:** Phase 2 (test execution interface).

**Confidence:** HIGH.

---

### Pitfall Mi5: CI ingestion API tokens have no scope or expiry

**What goes wrong:** If the CI ingestion endpoint uses a single long-lived API token per workspace with no scope restrictions, a leaked token gives full API access. CI tokens get embedded in CI YAML files, commit logs, and build artifacts — they are among the most frequently leaked credentials.

**Prevention:**
- Issue separate `CI ingestion tokens` scoped only to `POST /api/v1/runs/ingest`. These tokens cannot read data, manage users, or access billing.
- Add `expires_at` to all tokens. Ingestion tokens default to 1-year expiry with renewal.
- Log every ingestion request with the token ID (not the token value) so compromised tokens can be identified and rotated.

**Phase:** Phase 1 (API auth design) or Phase 2 (before the ingestion endpoint is built).

**Confidence:** HIGH.

---

## Phase-Specific Warnings

| Phase | Topic | Likely Pitfall | Mitigation |
|---|---|---|---|
| Phase 1 | Schema design | JSONB steps[] (C1) | Use `test_case_steps` table |
| Phase 1 | Multi-tenancy | Missing workspace_id filters (C2) | Enable PostgreSQL RLS before any data |
| Phase 1 | Auth setup | Auth.js v5 JWT field loss (C5) | Integration test session persistence before building any feature on top |
| Phase 1 | Deployment | Railway cold starts (Mi3) | Configure Always On immediately |
| Phase 1 | API design | Unscoped CI tokens (Mi5) | Token scoping in initial auth design |
| Phase 2 | Test case editor | Sequential round trips kill 30s target (M1) | Optimistic UI, no modal-based creation |
| Phase 2 | Real-time dashboard | SSE connection drops on Railway proxy (C3) | Test SSE on Railway URL in week 1 of Phase 2 |
| Phase 2 | Real-time dashboard | Single-process pub/sub (M4) | Valkey pub/sub architecture, not in-process EventEmitter |
| Phase 2 | Test execution | Concurrent run status inconsistency (M5) | Computed status, not directly written status |
| Phase 2 | CI ingestion | JUnit XML parser gaps (C4) | Fixture library before parser; store raw payloads |
| Phase 2 | CI ingestion | Allure JSON version variation (Mi2) | Same fixture strategy; parse defensively |
| Phase 2 | Navigation | Suite depth violates 3-click rule (Mi1) | Left-panel suite tree, not page navigation |
| Phase 2 | Team management | Seat counting edge cases (M3) | Define counting rules in schema comments before building |
| Phase 2 | Performance | No pagination on test case list (M2) | Cursor pagination and indexes from first query |
| Phase 2 | UX | Keyboard shortcut conflicts (Mi4) | Single-key shortcuts in execution context only |

---

## Sources

All findings are based on training knowledge (cutoff August 2025) applied to:
- The specific Velo project context and stack (Next.js Pages Router, Fastify, PostgreSQL, Valkey, Auth.js v5, Railway)
- Known PostgreSQL modeling patterns (JSONB vs normalized tables)
- Known JUnit XML schema variation in CI tooling (well-documented in CI ecosystem)
- Known Auth.js v5 migration behavior from v4
- Known Railway proxy behavior for long-lived connections
- Known SaaS multi-tenancy isolation patterns
- Known distributed pub/sub patterns for real-time systems

**Requires external verification before implementation (MEDIUM confidence items):**
- Auth.js v5 exact API surface for credentials provider + JWT sessions — verify against https://authjs.dev/getting-started/migrating-to-v5
- Railway SSE/WebSocket timeout configuration — verify against current Railway networking docs
- Allure JSON schema across versions — verify against https://github.com/allure-framework/allure2/releases
- Railway sleep/cold-start behavior by plan tier — verify against current Railway pricing/plan docs
