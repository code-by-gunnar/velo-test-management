# Phase 4: CI Ingestion - Research

**Researched:** 2026-03-10
**Domain:** JUnit XML parsing (5 variants), Allure JSON ingestion, Cloudflare R2 storage, API key authentication, BullMQ async processing
**Confidence:** HIGH

---

## Summary

Phase 4 adds a REST API that CI pipelines can POST test results to — JUnit XML or Allure JSON — with auto-mapping of results to existing test cases by name, and raw payload storage in Cloudflare R2 for debugging. It builds on top of the existing test_runs and run_items tables from Phase 3.

The most important technical challenge is **JUnit XML variant handling**. There is no official JUnit XML specification — every tool (pytest, Maven Surefire, Gradle, Jest-junit, gotestsum) produces subtly different XML. A naive parser that assumes a single `<testsuite>` root, or that `testcase` is always an array, will break on real-world CI output. The parser must be defensive: handle both `<testsuites>` and `<testsuite>` as root, force all `testcase` and `testsuite` children to arrays, tolerate missing `classname`, and normalize both `<failure>` and `<error>` children into a failed status.

The second critical concern is **raw payload storage**. The requirement is explicit: raw payloads go to Cloudflare R2, NOT to PostgreSQL. This means the ingestion endpoint must upload the raw bytes to R2 before (or in parallel with) parsing, so a copy is always available even if the parser fails. R2 is S3-compatible; use `@aws-sdk/client-s3` v3.

Authentication for the CI endpoint needs a separate mechanism from the Auth.js session cookies used by the browser UI. A database table of workspace-scoped API keys, hashed with SHA-256, is the standard pattern. The key is only shown once at creation time; subsequent verifications compare SHA-256(incoming) against the stored hash.

**Primary recommendation:** `fast-xml-parser` v4/v5 for JUnit XML (no native bindings, excellent TypeScript support, `isArray` option handles single-element variance); standard `JSON.parse` for Allure JSON (it is already valid JSON); `@aws-sdk/client-s3` v3 for R2 upload; SHA-256 API keys in a new `api_keys` table; synchronous ingestion within the HTTP request (no BullMQ needed for Phase 4 — payloads are small and parsing is fast).

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| IN-01 | CI pipeline POSTs JUnit XML; results auto-mapped to test cases by name or external ID; test run created | Fastify multipart endpoint + fast-xml-parser + test_cases name-match query + run/run_items insert. Auth via API key from api_keys table. |
| IN-02 | CI pipeline POSTs Allure JSON; results auto-mapped to test cases | Same endpoint pattern as IN-01 but JSON.parse instead of XML; map Allure status to Velo test_status; use fullName or name for case matching. |
| IN-03 | JUnit XML parser handles pytest-junit, Surefire/Maven, Gradle, Jest-junit, Go gotestsum without error | fast-xml-parser isArray option forces testcase/testsuite to arrays; root normalizer handles both testsuites and testsuite root elements; classname made optional. |
| IN-04 | Raw CI payloads stored in Cloudflare R2, NOT in PostgreSQL; developer can retrieve raw payload | @aws-sdk/client-s3 PutObjectCommand to R2 bucket before parsing; store R2 key on ci_ingestion_runs table; GET /ingestion-runs/:id/payload proxies raw bytes from R2. |
</phase_requirements>

---

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | ^5.0.0 | HTTP server, multipart upload endpoint | Already in stack |
| @fastify/multipart | ^9.4.0 | Parse multipart/form-data for file upload | Already in stack — registered in server.ts |
| postgres | ^3.4.8 | Raw SQL for api_keys, ci_ingestion_runs, run_items insert | Already in stack |
| iovalkey | ^0.3.3 | Valkey (not needed for ingestion itself, but present) | Already in stack |
| uuidv7 | ^1.1.0 | UUID v7 PKs for new rows | Already in stack |
| bullmq | ^5.70.4 | Already present — NOT needed for Phase 4 ingestion | Already in stack (for future phases) |

### New Dependencies
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fast-xml-parser | ^4.5.x or ^5.x | Parse JUnit XML without C/C++ bindings | 6M weekly downloads, used by Microsoft/NASA/VMware, TypeScript-first, `isArray` option is critical for JUnit variant handling |
| @aws-sdk/client-s3 | ^3.x | Upload/download objects to Cloudflare R2 | Official AWS SDK v3; R2 is S3-compatible; modular (only client-s3 needed) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fast-xml-parser | xml2js | xml2js is older, callback-based, less TypeScript-friendly; fast-xml-parser is actively maintained and faster |
| fast-xml-parser | @xml-tools/parser | Too heavy (built for XML schemas); overkill for JUnit |
| @aws-sdk/client-s3 | node-fetch + R2 REST API directly | More code to write, no retry/credential management; sdk handles all of that |
| SHA-256 API key hash | bcrypt API key hash | SHA-256 is appropriate for high-entropy random tokens (32 bytes = 256 bits); bcrypt is for low-entropy user passwords. API key tokens are random, so SHA-256 lookup is O(1) without bcrypt rounds. |
| Synchronous ingestion | BullMQ async queue | Files are small (<10MB limit already set); parsing is CPU-bound but fast (<100ms); async queue adds complexity without benefit at Phase 4 scale. BullMQ is reserved for Phase 5 webhook fanout. |

**Installation:**
```bash
cd apps/api && pnpm add fast-xml-parser @aws-sdk/client-s3
```

---

## Architecture Patterns

### Recommended Project Structure
```
apps/api/src/
├── routes/
│   ├── ingestion.ts         # POST /ingest/junit, POST /ingest/allure, GET /ingestion-runs/:id/payload
│   └── api-keys.ts          # POST, GET, DELETE /api-keys (workspace-scoped)
├── lib/
│   ├── junit-parser.ts      # parseJUnitXml(raw: string) → NormalizedResult[]
│   ├── allure-parser.ts     # parseAllureJson(raw: string) → NormalizedResult[]
│   └── r2.ts                # S3Client singleton + uploadToR2() + getR2Url()
```

### Pattern 1: API Key Authentication for CI Endpoints

**What:** Workspace-scoped API keys stored as SHA-256 hashes; CI pipelines send `Authorization: Bearer velo_<key>` header.
**When to use:** All `/ingest/*` endpoints. Auth.js session cookies are browser-only; CI pipelines cannot get session tokens.

```typescript
// Schema: api_keys table
// id, workspace_id, name (label), key_hash (sha256 hex), key_prefix (first 8 chars for lookup),
// created_by, created_at, expires_at (nullable), revoked_at (nullable)

// Key generation (shown to user ONCE at creation, never stored)
import crypto from "node:crypto"
function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = "velo_" + crypto.randomBytes(32).toString("hex")  // 69-char key
  const hash = crypto.createHash("sha256").update(raw).digest("hex")
  const prefix = raw.slice(0, 8)  // "velo_xxx" — for efficient lookup narrowing
  return { raw, hash, prefix }
}

// Verification in preHandler hook for ingestion routes
async function verifyApiKey(
  rawKey: string,
  sql: Sql
): Promise<{ workspaceId: string } | null> {
  const prefix = rawKey.slice(0, 8)
  const hash = crypto.createHash("sha256").update(rawKey).digest("hex")

  const [key] = await sql`
    SELECT workspace_id FROM api_keys
    WHERE key_prefix = ${prefix}
      AND key_hash = ${hash}
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > NOW())
    LIMIT 1
  `
  return key ? { workspaceId: key.workspace_id } : null
}
```

### Pattern 2: Multipart Upload + R2 Store + Parse Flow

**What:** Single ingestion endpoint receives file, uploads raw bytes to R2 first, then parses.
**When to use:** POST /ingest/junit and POST /ingest/allure

```typescript
// Source: @fastify/multipart docs + Cloudflare R2 S3 SDK docs
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import { r2Client } from "../lib/r2.js"

fastify.post("/api/workspaces/:workspaceId/ingest/junit", async (request, reply) => {
  // 1. Verify API key (not session)
  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith("Bearer ")) return reply.status(401).send({ error: "Missing API key" })
  const apiKey = authHeader.slice(7)
  const keyRecord = await verifyApiKey(apiKey, sql)
  if (!keyRecord || keyRecord.workspaceId !== request.params.workspaceId) {
    return reply.status(403).send({ error: "Invalid API key" })
  }

  // 2. Read multipart file (already limited to 5MB by @fastify/multipart in server.ts)
  const data = await request.file()
  if (!data) return reply.status(400).send({ error: "No file in request" })
  const rawBytes = await data.toBuffer()  // OK to buffer — 5MB max

  // 3. Upload raw to R2 BEFORE parsing (always preserve, even if parse fails)
  const r2Key = `ingestion/${workspaceId}/${uuidv7()}/payload.xml`
  await r2Client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: r2Key,
    Body: rawBytes,
    ContentType: "application/xml",
  }))

  // 4. Parse
  const results = parseJUnitXml(rawBytes.toString("utf8"))

  // 5. Create run + run_items + ci_ingestion_runs record in one transaction
  const run = await withWorkspace(workspaceId, async (tx) => {
    // ... insert test_runs, run_items, ci_ingestion_runs
  })

  reply.status(201).send(run)
})
```

### Pattern 3: Defensive JUnit XML Parsing

**What:** fast-xml-parser with `isArray` to force `testcase`/`testsuite` to arrays; root normalizer handles both `<testsuites>` and `<testsuite>` roots.
**When to use:** All JUnit XML inputs.

The five target variants produce these structural differences:

| Tool | Root element | classname format | failure/error | system-out location |
|------|-------------|-----------------|---------------|---------------------|
| pytest-junit | `<testsuites>` wrapping `<testsuite>` | `module.ClassName` | `<failure message="...">traceback</failure>` | Inside `<testcase>` |
| Maven Surefire | `<testsuite>` as root (no wrapper) | `com.example.ClassName` | `<failure>` or `<error>` | Inside `<testsuite>` |
| Gradle | `<testsuite>` as root | `com.example.ClassName` | `<failure>` | Inside `<testsuite>` |
| Jest-junit | `<testsuites>` wrapping `<testsuite>` | `describe block name` | `<failure message="...">diff</failure>` | Inside `<testcase>` |
| gotestsum | `<testsuites>` wrapping `<testsuite>` | Go package path | `<failure>` | Inside `<testcase>` |

**Key parser options (fast-xml-parser v4/v5):**

```typescript
// Source: fast-xml-parser GitHub docs/v4/2.XMLparseOptions.md
import { XMLParser } from "fast-xml-parser"

const ALWAYS_ARRAY = [
  "testsuites.testsuite",
  "testsuite",                     // when root IS testsuite (no wrapper)
  "testsuites.testsuite.testcase",
  "testsuite.testcase",
]

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  isArray: (name, jpath) => ALWAYS_ARRAY.includes(jpath),
  // CDATA sections in failure message text
  cdataPropName: "__cdata",
  // Preserve tag order (not needed for JUnit, skip for performance)
  preserveOrder: false,
})

export function parseJUnitXml(raw: string): NormalizedTestCase[] {
  const parsed = parser.parse(raw)

  // Normalize: handle both <testsuites> root and <testsuite> root
  const suites: ParsedSuite[] = parsed.testsuites
    ? parsed.testsuites.testsuite   // standard wrapper
    : parsed.testsuite              // no wrapper (Surefire, Gradle)
      ? (Array.isArray(parsed.testsuite) ? parsed.testsuite : [parsed.testsuite])
      : []

  return suites.flatMap(suite =>
    (suite.testcase ?? []).map((tc: ParsedTestcase) => ({
      name: tc["@_name"] ?? "",
      classname: tc["@_classname"] ?? null,
      // Fully-qualified name for case matching — prefer classname.name when available
      fullName: tc["@_classname"]
        ? `${tc["@_classname"]}.${tc["@_name"]}`
        : tc["@_name"],
      durationMs: Math.round((parseFloat(tc["@_time"] ?? "0")) * 1000),
      status: normalizeJUnitStatus(tc),
      failureMessage: tc.failure?.["@_message"] ?? tc.error?.["@_message"] ?? null,
      failureBody: tc.failure?.["#text"] ?? tc.error?.["#text"] ?? null,
    }))
  )
}

function normalizeJUnitStatus(tc: ParsedTestcase): "pass" | "fail" | "skipped" {
  if (tc.failure || tc.error) return "fail"
  if (tc.skipped !== undefined) return "skipped"
  return "pass"
}
```

### Pattern 4: Allure JSON Parsing

**What:** Each Allure result is a single JSON file (`{uuid}-result.json`). The ingest endpoint accepts either a single JSON file or a ZIP of multiple result files.
**When to use:** POST /ingest/allure

Allure status mapping to Velo test_status:

| Allure status | Velo status |
|---------------|-------------|
| `passed` | `pass` |
| `failed` | `fail` |
| `broken` | `fail` |
| `skipped` | `skipped` |
| `unknown` | `skipped` |

```typescript
interface AllureResult {
  uuid: string
  name?: string              // Test display name
  fullName?: string          // Fully-qualified name — use for case matching
  status: "passed" | "failed" | "broken" | "skipped" | "unknown"
  start?: number             // Unix ms timestamp
  stop?: number              // Unix ms timestamp
  statusDetails?: {
    message?: string
    trace?: string
  }
  labels?: Array<{ name: string; value: string }>
  // steps, attachments, links — ignored for Velo ingestion
}

export function parseAllureJson(raw: string): NormalizedTestCase[] {
  // Allure ingest can be:
  // Option A: single *-result.json file (one AllureResult object)
  // Option B: array of AllureResult objects (aggregated)
  // Option C: ZIP of *-result.json files (needs unzip — Phase 4 can accept single JSON only)

  const parsed = JSON.parse(raw) as AllureResult | AllureResult[]
  const results = Array.isArray(parsed) ? parsed : [parsed]

  return results.map(r => ({
    name: r.name ?? r.fullName ?? r.uuid,
    fullName: r.fullName ?? r.name ?? r.uuid,
    durationMs: r.start && r.stop ? r.stop - r.start : null,
    status: mapAllureStatus(r.status),
    failureMessage: r.statusDetails?.message ?? null,
    failureBody: r.statusDetails?.trace ?? null,
  }))
}

function mapAllureStatus(s: AllureResult["status"]): "pass" | "fail" | "skipped" {
  if (s === "passed") return "pass"
  if (s === "failed" || s === "broken") return "fail"
  return "skipped"
}
```

### Pattern 5: Test Case Name Matching

**What:** Map parsed test results back to existing test cases in the project by name.
**When to use:** During run_items creation after parsing.

```typescript
// Case matching: try fullName first (exact), then name only (partial)
// Returns map of { matchKey -> test_case_id }
async function buildCaseNameMap(
  projectId: string,
  workspaceId: string,
  tx: WorkspaceSql
): Promise<Map<string, string>> {
  const cases = await tx`
    SELECT id, title FROM test_cases
    WHERE project_id = ${projectId}
      AND deleted_at IS NULL
  `
  const map = new Map<string, string>()
  for (const c of cases) {
    map.set(c.title.toLowerCase(), c.id)
  }
  return map
}

// Matching logic — check fullName, then classname.name, then name alone
function findCaseId(
  normalized: NormalizedTestCase,
  caseMap: Map<string, string>
): string | null {
  // Try exact fullName match
  if (caseMap.has(normalized.fullName.toLowerCase())) {
    return caseMap.get(normalized.fullName.toLowerCase())!
  }
  // Try name-only match
  if (caseMap.has(normalized.name.toLowerCase())) {
    return caseMap.get(normalized.name.toLowerCase())!
  }
  return null  // unmatched — create run_item with test_case_id = null (orphan)
}
```

**Note on unmatched results:** When a CI test has no matching test case in Velo, create the run_item with `test_case_id = NULL` and store `case_title` from the parsed name. The run still shows the result; unmatched items appear in the detail view with a "No matching test case" indicator. Do not fail the ingestion because of unmatched cases.

### Pattern 6: Cloudflare R2 Client

**What:** S3Client configured for R2 endpoint; `uploadToR2()` and `getR2PresignedUrl()` helpers.
**When to use:** Before parsing (upload) and for payload retrieval endpoint.

```typescript
// Source: Cloudflare official docs — https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

if (!process.env.R2_ACCOUNT_ID) throw new Error("R2_ACCOUNT_ID required")
if (!process.env.R2_ACCESS_KEY_ID) throw new Error("R2_ACCESS_KEY_ID required")
if (!process.env.R2_SECRET_ACCESS_KEY) throw new Error("R2_SECRET_ACCESS_KEY required")
if (!process.env.R2_BUCKET_NAME) throw new Error("R2_BUCKET_NAME required")

export const r2Client = new S3Client({
  region: "auto",  // R2 requires "auto" — region is not used but SDK demands it
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
})

export async function uploadToR2(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  await r2Client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    Body: body,
    ContentType: contentType,
  }))
}

// Returns a signed URL valid for 1 hour (debugging use only)
export async function getR2PresignedUrl(key: string): Promise<string> {
  return getSignedUrl(
    r2Client,
    new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key }),
    { expiresIn: 3600 }
  )
}
```

### Pattern 7: ci_ingestion_runs Table

**What:** Audit record for each CI ingestion — links to the created test_run, stores R2 key, tracks status.
**When to use:** Insert on every ingestion request (success or parse failure).

```sql
CREATE TABLE ci_ingestion_runs (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_id UUID REFERENCES test_runs(id) ON DELETE SET NULL,  -- null if parsing failed
  api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  format VARCHAR(20) NOT NULL,  -- 'junit' | 'allure'
  r2_key TEXT NOT NULL,
  status VARCHAR(20) NOT NULL,  -- 'success' | 'parse_error' | 'partial'
  total_tests INTEGER,
  matched_tests INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Pattern 8: api_keys Table

```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,          -- human label, e.g. "CI/CD Pipeline"
  key_prefix VARCHAR(10) NOT NULL,     -- first 8 chars of raw key for lookup narrowing
  key_hash VARCHAR(64) NOT NULL,       -- SHA-256 hex of full raw key
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,             -- null = never expires
  revoked_at TIMESTAMPTZ              -- null = active; set to NOW() to revoke
);

-- RLS
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON api_keys
  USING (workspace_id::text = current_setting('app.workspace_id', true));
```

### Anti-Patterns to Avoid

- **Parsing before R2 upload:** If the parser throws, you lose the raw payload. Always upload to R2 first, then parse. Ingestion audit record has `status='parse_error'` with `run_id=null` if parse fails.
- **Storing raw XML/JSON in PostgreSQL:** The requirement is explicit — raw payloads go to R2 only. PostgreSQL stores only the R2 key. Do not put payload bytes in a `TEXT` or `BYTEA` column.
- **Assuming `testcase` is always an array:** With fast-xml-parser, if a `<testsuite>` has exactly one `<testcase>`, it will parse as an object, not an array. The `isArray` option prevents this. Without it, `suite.testcase.forEach` crashes on a real CI result with one test.
- **Strict name matching only:** Requiring exact `classname.name` = test case title is too brittle. Implement layered matching: try `fullName`, then `name` alone. Accept partial matches over hard failures.
- **Rejecting the whole ingestion on unmatched cases:** A CI run with 200 tests where 5 are new (no matching Velo case) should not fail. Create orphan run_items with `test_case_id = NULL`.
- **Blocking the HTTP response on Allure ZIP extraction:** Phase 4 accepts single Allure JSON files only. ZIP support is a v2 feature. Do not try to handle it now.
- **Using Auth.js session cookies for CI auth:** Session tokens are short-lived JWTs tied to browser sessions. CI pipelines need long-lived API keys. Never re-use the session plugin for machine-to-machine auth.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| XML parsing | Custom regex/string-split parser | fast-xml-parser | CDATA, attribute quoting, namespace handling, entity encoding — dozens of edge cases that break regex approaches |
| S3/R2 HTTP calls | Raw fetch with auth headers | @aws-sdk/client-s3 | Handles SigV4 signing, retries, multipart upload, presigned URLs, connection pooling |
| API key token generation | Math.random() or UUID as key | `crypto.randomBytes(32)` | Cryptographically random; Math.random() is not CSPRNG |
| SHA-256 hashing | Custom hash function | `node:crypto` built-in | No dependency needed; Node.js crypto is FIPS-compliant |
| Multipart file parsing | Manual boundary splitting | @fastify/multipart | Already registered in server.ts |

**Key insight:** JUnit XML has at least 10 known quirks across the five target parsers. fast-xml-parser with the right options handles all of them in ~20 lines of configuration. A hand-rolled parser would need a comprehensive fixture library to reach the same coverage.

---

## Common Pitfalls

### Pitfall 1: JUnit Single-Element Array Collapse
**What goes wrong:** `suite.testcase` is an object when there is exactly one `<testcase>`, causing `forEach` or `.map()` to crash.
**Why it happens:** fast-xml-parser (and all XML parsers) cannot know whether a tag should always be an array. Default behavior: one element = object, multiple = array.
**How to avoid:** Use the `isArray` option with explicit `jpath` entries for `testsuite.testcase` and `testsuites.testsuite.testcase`.
**Warning signs:** Ingestion works on large test suites but crashes on single-test files.

### Pitfall 2: Root Element Variance (Surefire/Gradle)
**What goes wrong:** Parser tries `parsed.testsuites.testsuite` but Surefire/Gradle output has `parsed.testsuite` at root.
**Why it happens:** There is no normative JUnit XML spec. Surefire and Gradle use `<testsuite>` as root; pytest, Jest-junit, and gotestsum wrap in `<testsuites>`.
**How to avoid:** Check for both roots: `parsed.testsuites ? parsed.testsuites.testsuite : parsed.testsuite`.
**Warning signs:** Java CI pipelines fail ingestion but Python/JS pipelines succeed.

### Pitfall 3: `<failure>` vs `<error>` Child Elements
**What goes wrong:** Parser only checks for `<failure>` child; Maven Surefire uses `<error>` for unexpected exceptions, so those tests show as `pass` in Velo.
**Why it happens:** JUnit spec treats assertion failures (`<failure>`) and unexpected exceptions (`<error>`) differently. Most parsers only handle `<failure>`.
**How to avoid:** Map both `tc.failure` and `tc.error` to Velo `fail` status.
**Warning signs:** Java integration tests show incorrect pass/fail counts.

### Pitfall 4: R2 Credentials Not Set at Startup
**What goes wrong:** First ingestion request crashes with `R2_ACCOUNT_ID required` error thrown inside the request handler, causing a 500 with no useful client error.
**Why it happens:** R2 env var checks inside the request handler fire late.
**How to avoid:** Validate all four R2 env vars at startup (in `r2.ts` module initialization), not inside request handlers. The module-level `if (!process.env.R2_ACCOUNT_ID) throw` pattern already used for `VALKEY_URL` should be used here.
**Warning signs:** API starts but first ingestion request returns 500 with `R2_ACCOUNT_ID required`.

### Pitfall 5: API Key Timing Attack
**What goes wrong:** Key lookup that short-circuits on `key_prefix` miss returns faster than a full miss, allowing timing analysis to confirm prefix validity.
**Why it happens:** Using `WHERE key_prefix = $1 AND key_hash = $2` in a single query — if prefix doesn't match, DB returns faster.
**How to avoid:** This is LOW risk for an internal QA tool. The key prefix is only 8 chars and not sensitive (it appears in logs). The full 256-bit hash comparison is the security gate. Accept this tradeoff for Phase 4.
**Warning signs:** N/A for MVP threat model.

### Pitfall 6: Allure ZIP vs Single JSON Mismatch
**What goes wrong:** CI tool sends a `.zip` of `*-result.json` files; parser calls `JSON.parse` on binary ZIP bytes and throws.
**Why it happens:** Allure CLI generates a ZIP archive of multiple result files. Single-file ingestion assumes JSON text.
**How to avoid:** Check `Content-Type` or file extension. If `application/zip` or `.zip`, return 400 with message "ZIP ingestion not supported in this version — send individual *-result.json files." Log and preserve the R2 upload so the raw bytes are available for debugging.
**Warning signs:** Allure ingestion always returns parse error for users using Allure CLI.

### Pitfall 7: Unmatched Cases Blocking Entire Ingestion
**What goes wrong:** CI has 200 tests; 3 are new feature tests with no Velo case yet. Ingestion fails entirely because `test_case_id` FK constraint rejects NULL.
**Why it happens:** `run_items.test_case_id` has a `NOT NULL` FK constraint in current schema.
**How to avoid:** The schema must allow `test_case_id = NULL` on run_items (already done — see schema.ts line 209: `test_case_id: uuid("test_case_id").notNull().references(...)`). This needs to be changed to nullable for CI-originated run items. Add a `source` column (`manual` | `ci`) and allow NULL `test_case_id` when `source = 'ci'`.
**Warning signs:** Partial CI results cause full ingestion 500.

### Pitfall 8: @fastify/multipart File Size Limit Already Set to 5MB
**What goes wrong:** CI JUnit XML from a large test suite (thousands of tests) exceeds 5MB.
**Why it happens:** `server.ts` registers multipart with `limits: { fileSize: 5 * 1024 * 1024 }`.
**How to avoid:** Increase the limit for ingestion routes to 50MB. The 5MB limit is appropriate for CSV imports (TC-06) but not for full test suite XML. Override the limit on the ingestion route registration, or increase the global limit since R2 handles storage — PostgreSQL is not receiving the bytes.
**Warning signs:** Large JUnit XML files return 413.

---

## Code Examples

### JUnit Parser — Complete Defensive Implementation

```typescript
// Source: fast-xml-parser GitHub docs + JUnit XML format analysis from testmoapp/junitxml
import { XMLParser } from "fast-xml-parser"

export interface NormalizedTestCase {
  name: string
  classname: string | null
  fullName: string
  durationMs: number | null
  status: "pass" | "fail" | "skipped"
  failureMessage: string | null
  failureBody: string | null
}

const ALWAYS_ARRAY_PATHS = [
  "testsuites.testsuite",
  "testsuites.testsuite.testcase",
  "testsuite.testcase",
]

const junitParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  cdataPropName: "__cdata",
  isArray: (_name, jpath) => ALWAYS_ARRAY_PATHS.includes(jpath),
})

export function parseJUnitXml(raw: string): NormalizedTestCase[] {
  let parsed: Record<string, unknown>
  try {
    parsed = junitParser.parse(raw)
  } catch (e) {
    throw new Error(`JUnit XML parse error: ${(e as Error).message}`)
  }

  // Normalize root — handle both <testsuites> wrapper and bare <testsuite>
  let suites: ParsedSuite[]
  if (parsed.testsuites) {
    const ts = (parsed.testsuites as Record<string, unknown>).testsuite
    suites = Array.isArray(ts) ? ts : ts ? [ts as ParsedSuite] : []
  } else if (parsed.testsuite) {
    const ts = parsed.testsuite
    suites = Array.isArray(ts) ? ts : [ts as ParsedSuite]
  } else {
    return []  // unrecognized format — return empty, not throw
  }

  return suites.flatMap(suite => {
    const testcases = suite.testcase
    if (!testcases) return []
    const cases = Array.isArray(testcases) ? testcases : [testcases]
    return cases.map(tc => normalizeTestcase(tc))
  })
}

function normalizeTestcase(tc: ParsedTestcase): NormalizedTestCase {
  const name = String(tc["@_name"] ?? "")
  const classname = tc["@_classname"] ? String(tc["@_classname"]) : null
  const fullName = classname ? `${classname}.${name}` : name
  const timeAttr = tc["@_time"]
  const durationMs = timeAttr ? Math.round(parseFloat(String(timeAttr)) * 1000) : null

  // Determine status
  let status: "pass" | "fail" | "skipped" = "pass"
  let failureMessage: string | null = null
  let failureBody: string | null = null

  if (tc.failure || tc.error) {
    status = "fail"
    const elem = (tc.failure ?? tc.error) as Record<string, unknown>
    failureMessage = String(elem["@_message"] ?? "")
    failureBody = String(elem["#text"] ?? elem.__cdata ?? "")
  } else if (tc.skipped !== undefined) {
    status = "skipped"
  }

  return { name, classname, fullName, durationMs, status, failureMessage, failureBody }
}
```

### R2 Upload Pattern

```typescript
// Source: Cloudflare R2 AWS SDK v3 docs
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

export const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

export function buildR2Key(workspaceId: string, format: "junit" | "allure", ingestionId: string): string {
  // e.g. "ingestion/018f2a3b-7c9d.../junit/018f2a3b-7c9e.../payload.xml"
  const ext = format === "junit" ? "xml" : "json"
  return `ingestion/${workspaceId}/${format}/${ingestionId}/payload.${ext}`
}
```

### API Key Creation Endpoint

```typescript
// POST /api/workspaces/:workspaceId/api-keys
// Returns the raw key ONCE — never stored, cannot be retrieved again
import crypto from "node:crypto"
import { uuidv7 } from "uuidv7"

fastify.post<{ Params: { workspaceId: string }; Body: { name: string } }>(
  "/api/workspaces/:workspaceId/api-keys",
  async (request, reply) => {
    if (!request.userId) return reply.status(401).send({ error: "Unauthorized" })
    const { workspaceId } = request.params

    const rawKey = "velo_" + crypto.randomBytes(32).toString("hex")
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex")
    const keyPrefix = rawKey.slice(0, 8)
    const id = uuidv7()

    await withWorkspace(workspaceId, async (tx) => {
      await tx`
        INSERT INTO api_keys (id, workspace_id, name, key_prefix, key_hash, created_by)
        VALUES (${id}::uuid, ${workspaceId}::uuid, ${request.body.name}, ${keyPrefix}, ${keyHash}, ${request.userId}::uuid)
      `
    })

    // Return raw key only at creation — this is the ONLY time it is shown
    reply.status(201).send({ id, name: request.body.name, key: rawKey, prefix: keyPrefix })
  }
)
```

---

## Schema Changes Required

### New Tables (both need new migration)

1. **api_keys** — workspace-scoped machine-to-machine auth tokens (see pattern 8 above)
2. **ci_ingestion_runs** — audit log for each CI push (see pattern 7 above)

### Existing Table Changes

**run_items** — `test_case_id` must become nullable for CI-sourced orphan items:

```sql
-- In new migration:
ALTER TABLE run_items ALTER COLUMN test_case_id DROP NOT NULL;
ALTER TABLE run_items ADD COLUMN IF NOT EXISTS source VARCHAR(10) NOT NULL DEFAULT 'manual';
-- source: 'manual' (user-created run) | 'ci' (ingested from CI pipeline)
```

Also add to schema.ts definition (runItems table): `source` column + make `test_case_id` nullable.

**Note:** The `case_title` column on run_items was already added via fixup in Phase 3 (`ALTER TABLE run_items ADD COLUMN IF NOT EXISTS case_title VARCHAR(500)`). For CI ingestion, populate `case_title` from the parsed test name when `test_case_id` is NULL.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| xml2js (callback-based) | fast-xml-parser (synchronous, TypeScript) | ~2020 | No callback pyramid; better TypeScript types |
| Store raw payloads in PostgreSQL BYTEA | Store in object storage (S3/R2), reference by key | ~2018 | No DB bloat from binary blobs; R2 egress-free |
| bcrypt for API key hash | SHA-256 for high-entropy random tokens | N/A (always correct) | API tokens are 256-bit random, not passwords — SHA-256 is O(1) and appropriate |
| AWS SDK v2 (aws-sdk) | AWS SDK v3 (@aws-sdk/client-s3) | 2021 | Modular: install only client-s3; tree-shakeable; first-class TypeScript |

**Deprecated:**
- `xml2js`: Callback API, weak TypeScript; avoid
- AWS SDK v2 (`aws-sdk`): Replaced by v3 modular packages; avoid installing the old monolithic package

---

## Open Questions

1. **File size limit for ingestion**
   - What we know: Current global multipart limit is 5MB (set in server.ts). A 2,000-test JUnit XML from Maven Surefire can exceed 5MB.
   - What's unclear: Actual file sizes in the target user's CI pipelines.
   - Recommendation: Increase global multipart limit to 50MB in server.ts, or override per-route on ingestion endpoints. 50MB is safe given R2 handles storage.

2. **Allure ZIP vs single-file ingestion**
   - What we know: Allure CLI produces a directory of `*-result.json` files or a ZIP. Single-file ingestion is simpler for Phase 4.
   - What's unclear: How many users will use Allure CLI (which produces ZIP) vs custom integrations (which may send single JSON).
   - Recommendation: Phase 4 accepts single Allure JSON file only. Return 400 with clear error if ZIP is detected. Document this in the API response.

3. **External ID mapping for test cases**
   - What we know: IN-01 says "auto-mapped to test cases by name or external ID." The current test_cases schema has no external_id column.
   - What's unclear: Whether users want to set an explicit external ID on test cases (e.g., from a test file path) vs relying on name matching.
   - Recommendation: Phase 4 uses name matching only (fullName, then name). External ID mapping requires a schema column (`external_id VARCHAR(255)` on test_cases) — add it in the Wave 0 migration but keep matching logic purely name-based for now. The column can be set via future API.

4. **UI for API key management**
   - What we know: A backend API for api_keys is needed. Whether Phase 4 includes a frontend page is unspecified.
   - Recommendation: Build the backend API (CRUD for api_keys). Include a minimal frontend page in the project settings area to create/revoke keys and display the setup curl command. Keep it simple — no pagination needed at MVP scale.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x |
| Config file | `apps/api/vitest.config.ts` |
| Quick run command | `cd apps/api && pnpm test` |
| Full suite command | `pnpm --recursive lint && pnpm --recursive typecheck && cd apps/api && pnpm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IN-01 | POST JUnit XML creates run + run_items, maps by name | integration | `cd apps/api && npx vitest run src/routes/__tests__/ingestion.test.ts -t "JUnit"` | No — Wave 0 |
| IN-02 | POST Allure JSON creates run + run_items, maps by name | integration | `cd apps/api && npx vitest run src/routes/__tests__/ingestion.test.ts -t "Allure"` | No — Wave 0 |
| IN-03 | JUnit parser handles all 5 variants without error | unit | `cd apps/api && npx vitest run src/lib/__tests__/junit-parser.test.ts` | No — Wave 0 |
| IN-04 | Raw payload uploaded to R2, not in PostgreSQL | integration (mocked R2) | `cd apps/api && npx vitest run src/routes/__tests__/ingestion.test.ts -t "R2"` | No — Wave 0 |

### Sampling Rate
- **Per task commit:** `cd apps/api && pnpm test`
- **Per wave merge:** `pnpm --recursive lint && pnpm --recursive typecheck && cd apps/api && pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/api/src/lib/__tests__/junit-parser.test.ts` — covers IN-03 (all 5 variants with fixture XML files)
- [ ] `apps/api/src/routes/__tests__/ingestion.test.ts` — covers IN-01, IN-02, IN-04
- [ ] `apps/api/src/routes/__tests__/api-keys.test.ts` — covers API key CRUD
- [ ] `apps/api/src/routes/__tests__/fixtures/pytest-report.xml` — pytest-junit fixture
- [ ] `apps/api/src/routes/__tests__/fixtures/surefire-report.xml` — Maven Surefire fixture
- [ ] `apps/api/src/routes/__tests__/fixtures/gradle-report.xml` — Gradle fixture
- [ ] `apps/api/src/routes/__tests__/fixtures/jest-junit-report.xml` — Jest-junit fixture
- [ ] `apps/api/src/routes/__tests__/fixtures/gotestsum-report.xml` — Go gotestsum fixture
- [ ] `apps/api/src/routes/__tests__/fixtures/allure-result.json` — Allure JSON fixture
- [ ] New migration: `api_keys` table, `ci_ingestion_runs` table, `run_items` source column + nullable test_case_id
- [ ] New env vars: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`

---

## Sources

### Primary (HIGH confidence)
- Cloudflare R2 AWS SDK v3 official docs — https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/ — endpoint format, S3Client config
- Allure Report official docs — https://allurereport.org/docs/how-it-works-test-result-file/ — complete JSON schema, status values
- fast-xml-parser GitHub — https://github.com/NaturalIntelligence/fast-xml-parser — `isArray` option, attributeNamePrefix, CDATA handling
- Existing codebase — schema.ts, server.ts, valkey.ts, email.queue.ts — patterns for BullMQ, multipart, withWorkspace, env var guards

### Secondary (MEDIUM confidence)
- testmoapp/junitxml GitHub — JUnit XML format conventions, confirmed: no formal spec, both root elements valid, failure vs error distinction
- GitLab CI JUnit docs — https://docs.gitlab.com/ci/testing/unit_test_report_examples/ — confirmed tool-specific generation commands
- Supabase API key management guide (April 2025) — SHA-256 prefix-based lookup pattern, confirmed for high-entropy tokens

### Tertiary (LOW confidence)
- JUnit XML structural differences per tool — inferred from parser source code references and community documentation; should be validated with actual fixture files in Wave 0

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — fast-xml-parser is the established standard (6M weekly downloads); @aws-sdk/client-s3 is official Cloudflare-recommended; both have official documentation
- JUnit variant parsing: MEDIUM — root element and isArray patterns confirmed from fast-xml-parser docs + community JUnit format docs; exact attribute differences per tool need fixture validation in Wave 0
- Allure JSON schema: HIGH — verified from official Allure docs (status values, required fields, fullName for matching)
- R2 integration: HIGH — official Cloudflare docs confirm S3Client config and endpoint format
- API key pattern: HIGH — standard pattern confirmed from multiple sources; crypto.randomBytes + SHA-256 is well-established
- Schema changes: MEDIUM — run_items.test_case_id nullable change requires careful migration; other tables are new

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (fast-xml-parser is stable; AWS SDK v3 is stable; R2 API is stable)
