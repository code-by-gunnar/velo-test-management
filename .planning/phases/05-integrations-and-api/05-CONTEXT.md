# Phase 5: Integrations and API - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

The full REST API is available with parity to the UI, outbound webhooks fire on key events, and Linear is integrated so defects can be filed from failed run items and their status synced back into the run view.

New capabilities NOT in this phase: Jira integration (v2), Slack/Teams notifications (v2), GitHub/GitLab PR status checks (v2), milestones/test plans (v2), SSO/SAML (v2), team invitations and RBAC (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Linear Connection Flow
- **OAuth app authentication** — Register Velo as a Linear OAuth app. User clicks "Connect Linear" → redirected to Linear → grants scopes → redirected back. OAuth tokens (access + refresh) stored per workspace.
- **Workspace-wide connection** — One Linear connection per Velo workspace. All projects in the workspace file issues to the same Linear organization.
- **Default team at setup** — During the "Connect Linear" OAuth flow, user selects a default Linear team. All defects go to that team. No per-defect team picker.
- **Setup location: Workspace Settings** — New "Integrations" tab in workspace settings. "Connect Linear" button with OAuth flow. Shows connection status, connected team, and disconnect option.

### File-to-Linear UX
- **Auto-create on file** — Pressing "File Defect" in DefectPrompt creates both the local defect record AND the Linear issue in one action. Title pre-filled from case name. No extra step.
- **Title + description only** — DefectPrompt exposes only title and description fields. Priority and labels are set by Linear team defaults. Keeps the keyboard-first flow fast.
- **Inline badge on defect chip** — Failed run items in the run detail view show a defect badge with the Linear issue status (e.g., "In Progress", "Done") pulled from Linear. Color-coded. Clicking opens the Linear issue URL in a new tab.
- **Linear webhooks for sync** — Register a webhook with Linear during OAuth. Linear pushes status changes to a Velo endpoint. Idempotency key prevents sync loops. Real-time status sync.
- **Graceful degradation** — If Linear is not connected when user files a defect, the defect is saved locally without any error or mention of Linear. Clean silent degradation.

### Webhook Configuration UX
- **Project-level with workspace override** — Primary: each project configures its own webhook endpoint in Project Settings > Webhooks. Workspace settings can set a default webhook URL that applies to all projects without explicit config.
- **One endpoint + event filter** — One webhook URL per project. Checkbox list of event types to subscribe to. User unchecks events they don't want.
- **Event types shipped:** `run.completed` and `run_item.failed` only. `milestone.reached` is skipped (milestones not built yet — TR-V2-01).
- **Test ping button** — "Send Test" button fires a test payload to the configured endpoint. Shows success/failure result inline. Immediate verification.
- **HMAC-SHA256 signing** — Auto-generate a signing secret per webhook. Every payload signed with `X-Velo-Signature` header. Recipients can verify authenticity.
- **BullMQ fanout** — Webhook delivery via a new `webhookQueue` following the same BullMQ pattern as `emailQueue`. Retry with exponential backoff on failure.

### REST API Full Parity (INT-03)
- **Unified auth middleware** — Single middleware that accepts EITHER session cookie (Auth.js) OR API key Bearer token. Every route gets both auth methods automatically. API keys resolve to the same workspace_id context as sessions.
- **Version prefix: /api/v1/** — All API-key-accessible routes mounted under `/api/v1/`. Allows future breaking changes via `/api/v2/` without disrupting existing integrations.
- **Same JSON response shape** — `/api/v1/` routes reuse existing route handlers. No separate serialization layer. Version prefix is an auth wrapper around the same logic.
- **Simple rate limiting** — 100 requests/minute per API key. Counter stored in Valkey with TTL. Returns 429 with `Retry-After` header when exceeded.
- **All CRUD gaps closed** — Add: PATCH project, DELETE project, GET workspace members (read-only list), PATCH workspace settings. Full parity as INT-03 requires.

### Claude's Discretion
- OAuth callback URL structure and token storage schema
- Linear webhook endpoint path and payload validation
- Rate limiter implementation details (sliding window vs fixed window)
- Webhook retry count and backoff configuration
- Linear API error handling and retry strategy
- /api/v1/ route registration pattern (prefix plugin vs manual)
- Webhook payload JSON schema
- Linear OAuth scope selection (which scopes to request)
- Workspace settings page layout for Integrations tab

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **verifyApiKey** (`apps/api/src/routes/api-keys.ts`): Prefix + SHA-256 hash lookup — reuse for unified auth middleware
- **emailQueue** (`apps/api/src/queues/email.queue.ts`): BullMQ pattern with 3 retries, exponential backoff — template for webhookQueue
- **getBullMQConnectionOptions** (`apps/api/src/lib/valkey.ts`): URL-based connection factory — reuse for webhook worker
- **Valkey pub/sub** (`apps/api/src/routes/run-items.ts:138-165`): Fire-and-forget publish on run item status change — hook webhook trigger here
- **SSE pattern** (`apps/api/src/routes/runs.ts:446-519`): Per-run-id subscriber with heartbeat — Linear status updates can publish to same channels
- **DefectPrompt** (`apps/web/src/components/runs/DefectPrompt.tsx`): Currently has "Linear integration coming soon" text — replace with actual filing UI
- **Defects table** (`apps/api/src/db/schema.ts:225-236`): Already has `external_id` and `external_url` columns (both NULL) — ready for Linear issue data
- **withWorkspace** (`apps/api/src/lib/workspace.ts`): Tenant isolation wrapper — all new routes must use this
- **Session plugin** (`apps/api/src/plugins/session.ts`): Auth.js cookie verification — extend for dual auth

### Current API Route Inventory (31 routes)
- Auth: 5 routes (signup, signin, verify-otp, request-reset, reset-password)
- Workspaces: 5 routes (create, get by slug, patch slug, create project, seed)
- Test Cases: 8 routes (list, create, delete, patch, position, bulk, import)
- Suites: 5 routes (list tree, create, patch, position, delete)
- Runs: 7 routes (create, list, detail, abort, rerun-failures, history, SSE stream)
- Run Items: 3 routes (execute verdict, case comment, step comment)
- Defects: 2 routes (create, list)
- API Keys: 3 routes (create, list, revoke)
- Ingestion: 4 routes (junit POST, allure POST, list runs, get payload)

### Gaps for INT-03
- PATCH project (update name/key)
- DELETE project (soft delete)
- GET workspace members (read-only list — Phase 6 adds write operations)
- PATCH workspace (update settings)

### Integration Points
- **New tables:** `linear_connections` (workspace_id, access_token_enc, refresh_token_enc, team_id, team_name, connected_by, connected_at), `webhooks` (workspace_id, project_id, endpoint_url, secret, events[], active, created_by)
- **New queues:** `webhookQueue` (event fanout), `linearQueue` (async issue creation + sync)
- **New routes:** Linear OAuth callback, Linear webhook receiver, webhook CRUD, /api/v1/* mirror
- **Modified routes:** Defect creation (add Linear issue creation), run-items verdict (trigger webhook on fail)

</code_context>

<specifics>
## Specific Ideas

- The "Connect Linear" flow should feel like a 30-second setup — click button, authorize on Linear, pick team, done. No configuration pages or forms beyond team selection.
- Defect filing to Linear should be invisible to the keyboard flow — pressing Enter on "File Defect" handles both local and Linear creation. No extra confirmation for Linear.
- Webhook test ping should return a clear green checkmark or red X with the HTTP status code from the endpoint. No ambiguity about whether it worked.
- The /api/v1/ prefix should be documented with auto-generated OpenAPI/Swagger for developer self-service. (Implementation details at Claude's discretion.)
- Rate limiting should return a clear 429 with `X-RateLimit-Remaining` and `Retry-After` headers so API consumers can self-throttle.

</specifics>

<deferred>
## Deferred Ideas

- Jira two-way sync — v2 (INT-V2-01)
- GitHub/GitLab PR status checks — v2 (INT-V2-02)
- Slack/Teams notifications — v2 (INT-V2-03)
- `milestone.reached` webhook event — deferred until milestones are built (TR-V2-01)
- Per-project Linear team mapping — v2 if needed
- Tier-based rate limits — v2 (ship simple 100/min for MVP)
- Public API response format (snake_case, pagination metadata, HATEOAS) — v2

</deferred>

---

*Phase: 05-integrations-and-api*
*Context gathered: 2026-03-10*
