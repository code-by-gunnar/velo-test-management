import type { FastifyPluginAsync } from "fastify"
import { uuidv7 } from "uuidv7"
import { withWorkspace } from "../db/tenant.js"
import { parseJUnitXml } from "../lib/junit-parser.js"
import { parseAllureJson } from "../lib/allure-parser.js"
import { uploadObject, buildIngestionKey, getPresignedUrl, storageEnabled } from "../lib/storage.js"
import { verifyApiKey } from "./api-keys.js"
import { captureEvent } from "../lib/posthog.js"
import { enforceRateLimit } from "../lib/rate-limiter.js"
import type { FastifyInstance, FastifyReply } from "fastify"

// UUID validation (any version)
const UUID_ANY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: string): boolean {
  return UUID_ANY_RE.test(value)
}

// Per-API-key throttle for CI ingestion (VEL-60). The v1-prefixed routes get the
// 100/min v1 limiter, but the documented standalone /ingest/* path is registered
// in server.ts with no limiter, so a compromised/looping CI key could flood raw
// XML/JSON uploads (each = storage write + parse). Tunable via env; defaults to a
// generous 30/min per key — well above real pipeline cadence, low enough to cap
// abuse.
const INGEST_RATE_MAX = Math.max(1, parseInt(process.env.INGEST_RATE_LIMIT ?? "30", 10) || 30)

/**
 * Throttle an ingestion request by API key. Returns true if the request was
 * throttled AND a response (429/503) was already sent — the caller must return
 * immediately. Fails CLOSED on Valkey error (503), matching the v1 limiter: an
 * attacker must not be able to bypass the limit by disrupting Valkey. Skips
 * silently only when no Valkey decorator is present (unit apps that omit it) —
 * in a real deploy the plugin is always registered.
 */
async function ingestThrottled(
  fastify: FastifyInstance,
  reply: FastifyReply,
  keyId: string
): Promise<boolean> {
  const valkey = (fastify as FastifyInstance & { valkey?: import("iovalkey").Redis }).valkey
  if (!valkey) return false

  let rl
  try {
    rl = await enforceRateLimit(valkey, `ingest:${keyId}`, { windowMs: 60_000, max: INGEST_RATE_MAX })
  } catch (err) {
    fastify.log.error({ err }, "Ingestion rate limiter Valkey error — failing closed (503)")
    reply.header("Retry-After", "5")
    await reply.status(503).send({ error: "Rate limiter temporarily unavailable", retry_after: 5 })
    return true
  }

  reply.header("X-RateLimit-Limit", String(INGEST_RATE_MAX))
  reply.header("X-RateLimit-Remaining", String(rl.remaining))
  if (!rl.allowed) {
    reply.header("Retry-After", String(rl.retryAfter))
    await reply.status(429).send({ error: "Ingestion rate limit exceeded", retry_after: rl.retryAfter })
    return true
  }
  return false
}

// Map NormalizedTestCase status to testStatusEnum values
function mapStatus(status: "pass" | "fail" | "skipped"): string {
  return status // pass->pass, fail->fail, skipped->skipped (direct match)
}

// ── Ingestion routes ───────────────────────────────────────────────────────────
//
// Authentication: API key (Bearer token) — NOT session auth.
// Only the GET /payload endpoint uses session auth.
//
// All POST ingest routes:
//  1. Validate Bearer API key via verifyApiKey()
//  2. Upload raw payload to R2 BEFORE parsing (so we always have the raw data)
//  3. Parse the payload
//  4. Insert test_runs + run_items + ci_ingestion_runs in one withWorkspace transaction
//  5. reply.send() called OUTSIDE withWorkspace (per CLAUDE.md rule)

const ingestionRoutes: FastifyPluginAsync = async (fastify) => {

  // ── POST /ingest/junit ─────────────────────────────────────────────────────
  fastify.post<{
    Params: { workspaceId: string; projectId: string }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/ingest/junit",
    async (request, reply) => {
      // API key auth
      const authHeader = request.headers.authorization
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return reply.status(401).send({ error: "Invalid or missing API key" })
      }
      const rawKey = authHeader.slice(7)
      const verified = await verifyApiKey(rawKey)
      if (!verified) {
        return reply.status(401).send({ error: "Invalid or missing API key" })
      }
      const { workspaceId, projectId } = request.params
      if (verified.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "API key does not belong to this workspace" })
      }
      const keyId = verified.keyId

      // Per-key ingestion throttle (VEL-60)
      if (await ingestThrottled(fastify, reply, keyId)) return

      if (!isUuid(projectId)) {
        return reply.status(400).send({ error: "Invalid projectId" })
      }

      // Read multipart file
      let rawBytes: Buffer
      try {
        const file = await request.file()
        if (!file) {
          return reply.status(400).send({ error: "No file uploaded" })
        }
        const chunks: Buffer[] = []
        for await (const chunk of file.file) {
          chunks.push(chunk)
        }
        rawBytes = Buffer.concat(chunks)
      } catch {
        return reply.status(400).send({ error: "Failed to read uploaded file" })
      }

      const ingestionId = uuidv7()
      const r2Key = buildIngestionKey(workspaceId, "junit", ingestionId)

      // Upload to R2 BEFORE parsing (even if parse later fails, we have the raw data)
      if (storageEnabled()) {
        try {
          await uploadObject(r2Key, rawBytes, "application/xml")
        } catch {
          // R2 upload failure is non-fatal — log and continue
          fastify.log.warn({ ingestionId }, "R2 upload failed for junit ingestion — continuing without storage")
        }
      }

      // Parse XML
      let parsed
      try {
        parsed = parseJUnitXml(rawBytes.toString("utf8"))
      } catch (err) {
        // Insert failed ingestion record
        const errorMessage = String(err instanceof Error ? err.message : err)
        try {
          await withWorkspace(workspaceId, async (tx) => {
            await tx`
              INSERT INTO ci_ingestion_runs (id, workspace_id, project_id, api_key_id, format, r2_key, status, error_message)
              VALUES (
                ${ingestionId}::uuid,
                current_setting('app.workspace_id', true)::uuid,
                ${projectId}::uuid,
                ${keyId}::uuid,
                'junit',
                ${r2Key},
                'parse_error',
                ${errorMessage}
              )
            `
          })
        } catch {
          // best-effort
        }
        return reply.status(422).send({
          error: "JUnit XML parse error",
          detail: errorMessage,
        })
      }

      // Build name map from existing test cases in project
      const caseNameMap = new Map<string, string>() // lowercase name -> test_case_id

      try {
        const cases = await withWorkspace(workspaceId, async (tx) => {
          return (await tx`
            SELECT id, title FROM test_cases
            WHERE project_id = ${projectId}::uuid
              AND deleted_at IS NULL
          `) as unknown as Array<{ id: string; title: string }>
        })
        for (const tc of cases) {
          caseNameMap.set(tc.title.toLowerCase(), tc.id)
        }
      } catch {
        // If we can't load cases, continue with empty map (all orphan items)
        fastify.log.warn({ projectId }, "Failed to load test cases for name mapping — creating all orphan items")
      }

      // Insert run, items, and ingestion record in one transaction
      const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ")
      const runName = `CI: JUnit Import ${timestamp}`

      let runId: string
      let totalTests: number
      let matchedTests: number

      const txResult = await withWorkspace(workspaceId, async (tx) => {
        const newRunId = uuidv7()

        await tx`
          INSERT INTO test_runs (id, workspace_id, project_id, name, status, started_at, completed_at)
          VALUES (
            ${newRunId}::uuid,
            current_setting('app.workspace_id', true)::uuid,
            ${projectId}::uuid,
            ${runName},
            'completed',
            NOW(),
            NOW()
          )
        `

        // Match each result to a case (fullName then name, case-insensitive) and
        // bulk-insert all run_items in one round trip (VEL-52 / audit #5).
        const itemRows = parsed.map((tc) => ({
          id: uuidv7(),
          workspace_id: workspaceId,
          run_id: newRunId,
          test_case_id:
            caseNameMap.get(tc.fullName.toLowerCase()) ??
            caseNameMap.get(tc.name.toLowerCase()) ??
            null,
          case_title: tc.name,
          status: mapStatus(tc.status),
          source: "ci",
          comment: tc.failureMessage ?? null,
        }))
        const matched = itemRows.filter((r) => r.test_case_id !== null).length
        if (itemRows.length > 0) {
          await tx`INSERT INTO run_items ${tx(itemRows, "id", "workspace_id", "run_id", "test_case_id", "case_title", "status", "source", "comment")}`
        }

        const total = parsed.length

        await tx`
          INSERT INTO ci_ingestion_runs (id, workspace_id, project_id, run_id, api_key_id, format, r2_key, status, total_tests, matched_tests)
          VALUES (
            ${ingestionId}::uuid,
            current_setting('app.workspace_id', true)::uuid,
            ${projectId}::uuid,
            ${newRunId}::uuid,
            ${keyId}::uuid,
            'junit',
            ${r2Key},
            'success',
            ${total},
            ${matched}
          )
        `

        return { newRunId, total, matched }
      })

      runId = txResult.newRunId
      totalTests = txResult.total
      matchedTests = txResult.matched

      captureEvent(workspaceId, "ci_results_ingested", {
        format: "junit",
        workspace_id: workspaceId,
        project_id: projectId,
        total_tests: totalTests,
        matched_tests: matchedTests,
      })

      return reply.status(201).send({
        ingestion_id: ingestionId,
        run_id: runId,
        total_tests: totalTests,
        matched_tests: matchedTests,
        unmatched_tests: totalTests - matchedTests,
      })
    }
  )

  // ── POST /ingest/allure ────────────────────────────────────────────────────
  fastify.post<{
    Params: { workspaceId: string; projectId: string }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/ingest/allure",
    async (request, reply) => {
      // API key auth
      const authHeader = request.headers.authorization
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return reply.status(401).send({ error: "Invalid or missing API key" })
      }
      const rawKey = authHeader.slice(7)
      const verified = await verifyApiKey(rawKey)
      if (!verified) {
        return reply.status(401).send({ error: "Invalid or missing API key" })
      }
      const { workspaceId, projectId } = request.params
      if (verified.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "API key does not belong to this workspace" })
      }
      const keyId = verified.keyId

      // Per-key ingestion throttle (VEL-60)
      if (await ingestThrottled(fastify, reply, keyId)) return

      if (!isUuid(projectId)) {
        return reply.status(400).send({ error: "Invalid projectId" })
      }

      // Accept application/json body OR multipart file
      let rawString: string
      const contentType = request.headers["content-type"] ?? ""

      if (contentType.includes("multipart/form-data")) {
        try {
          const file = await request.file()
          if (!file) {
            return reply.status(400).send({ error: "No file uploaded" })
          }
          const chunks: Buffer[] = []
          for await (const chunk of file.file) {
            chunks.push(chunk)
          }
          rawString = Buffer.concat(chunks).toString("utf8")
        } catch {
          return reply.status(400).send({ error: "Failed to read uploaded file" })
        }
      } else {
        // JSON body
        const body = request.body
        if (typeof body === "string") {
          rawString = body
        } else {
          rawString = JSON.stringify(body)
        }
      }

      const ingestionId = uuidv7()
      const r2Key = buildIngestionKey(workspaceId, "allure", ingestionId)

      // Upload to R2 BEFORE parsing
      if (storageEnabled()) {
        try {
          await uploadObject(r2Key, Buffer.from(rawString, "utf8"), "application/json")
        } catch {
          fastify.log.warn({ ingestionId }, "R2 upload failed for allure ingestion — continuing without storage")
        }
      }

      // Parse Allure JSON
      let parsed
      try {
        parsed = parseAllureJson(rawString)
      } catch (err) {
        const errorMessage = String(err instanceof Error ? err.message : err)
        try {
          await withWorkspace(workspaceId, async (tx) => {
            await tx`
              INSERT INTO ci_ingestion_runs (id, workspace_id, project_id, api_key_id, format, r2_key, status, error_message)
              VALUES (
                ${ingestionId}::uuid,
                current_setting('app.workspace_id', true)::uuid,
                ${projectId}::uuid,
                ${keyId}::uuid,
                'allure',
                ${r2Key},
                'parse_error',
                ${errorMessage}
              )
            `
          })
        } catch {
          // best-effort
        }
        return reply.status(422).send({
          error: "Allure JSON parse error",
          detail: errorMessage,
        })
      }

      // Build name map from existing test cases
      const caseNameMap = new Map<string, string>()
      try {
        const cases = await withWorkspace(workspaceId, async (tx) => {
          return (await tx`
            SELECT id, title FROM test_cases
            WHERE project_id = ${projectId}::uuid
              AND deleted_at IS NULL
          `) as unknown as Array<{ id: string; title: string }>
        })
        for (const tc of cases) {
          caseNameMap.set(tc.title.toLowerCase(), tc.id)
        }
      } catch {
        fastify.log.warn({ projectId }, "Failed to load test cases for name mapping")
      }

      const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ")
      const runName = `CI: Allure Import ${timestamp}`

      const txResult = await withWorkspace(workspaceId, async (tx) => {
        const newRunId = uuidv7()

        await tx`
          INSERT INTO test_runs (id, workspace_id, project_id, name, status, started_at, completed_at)
          VALUES (
            ${newRunId}::uuid,
            current_setting('app.workspace_id', true)::uuid,
            ${projectId}::uuid,
            ${runName},
            'completed',
            NOW(),
            NOW()
          )
        `

        // Bulk-insert all run_items in one round trip (VEL-52 / audit #5).
        const itemRows = parsed.map((tc) => ({
          id: uuidv7(),
          workspace_id: workspaceId,
          run_id: newRunId,
          test_case_id:
            caseNameMap.get(tc.fullName.toLowerCase()) ??
            caseNameMap.get(tc.name.toLowerCase()) ??
            null,
          case_title: tc.name,
          status: mapStatus(tc.status),
          source: "ci",
          comment: tc.failureMessage ?? null,
        }))
        const matched = itemRows.filter((r) => r.test_case_id !== null).length
        if (itemRows.length > 0) {
          await tx`INSERT INTO run_items ${tx(itemRows, "id", "workspace_id", "run_id", "test_case_id", "case_title", "status", "source", "comment")}`
        }

        const total = parsed.length

        await tx`
          INSERT INTO ci_ingestion_runs (id, workspace_id, project_id, run_id, api_key_id, format, r2_key, status, total_tests, matched_tests)
          VALUES (
            ${ingestionId}::uuid,
            current_setting('app.workspace_id', true)::uuid,
            ${projectId}::uuid,
            ${newRunId}::uuid,
            ${keyId}::uuid,
            'allure',
            ${r2Key},
            'success',
            ${total},
            ${matched}
          )
        `

        return { newRunId, total, matched }
      })

      captureEvent(workspaceId, "ci_results_ingested", {
        format: "allure",
        workspace_id: workspaceId,
        project_id: projectId,
        total_tests: txResult.total,
        matched_tests: txResult.matched,
      })

      return reply.status(201).send({
        ingestion_id: ingestionId,
        run_id: txResult.newRunId,
        total_tests: txResult.total,
        matched_tests: txResult.matched,
        unmatched_tests: txResult.total - txResult.matched,
      })
    }
  )

  // ── GET /ingestion-runs/:ingestionId/payload — presigned R2 URL ─────────────
  // Session auth (for human debugging — not API key)
  fastify.get<{
    Params: { workspaceId: string; ingestionId: string }
  }>(
    "/api/workspaces/:workspaceId/ingestion-runs/:ingestionId/payload",
    async (request, reply) => {
      if (!request.userId) {
        return reply.status(401).send({ error: "Unauthorized" })
      }

      const { workspaceId, ingestionId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(ingestionId)) {
        return reply.status(400).send({ error: "Invalid ingestionId" })
      }

      const result = await withWorkspace(workspaceId, async (tx) => {
        const rows = await tx`
          SELECT id, r2_key FROM ci_ingestion_runs
          WHERE id = ${ingestionId}::uuid
            AND workspace_id = current_setting('app.workspace_id', true)::uuid
        `
        if (rows.length === 0) return null
        return rows[0] as unknown as { id: string; r2_key: string }
      })

      if (!result) {
        return reply.status(404).send({ error: "Ingestion run not found" })
      }

      try {
        const url = await getPresignedUrl(result.r2_key)
        return reply.send({ url })
      } catch {
        return reply.status(500).send({ error: "Failed to generate presigned URL" })
      }
    }
  )

  // ── GET /projects/:projectId/ingestion-runs — list ingestion runs ────────────
  fastify.get<{
    Params: { workspaceId: string; projectId: string }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/ingestion-runs",
    async (request, reply) => {
      if (!request.userId) {
        return reply.status(401).send({ error: "Unauthorized" })
      }

      const { workspaceId, projectId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(projectId)) {
        return reply.status(400).send({ error: "Invalid projectId" })
      }

      const runs = await withWorkspace(workspaceId, async (tx) => {
        return tx`
          SELECT
            id, format, status, total_tests, matched_tests,
            error_message, created_at, run_id
          FROM ci_ingestion_runs
          WHERE project_id = ${projectId}::uuid
            AND workspace_id = current_setting('app.workspace_id', true)::uuid
          ORDER BY created_at DESC
          LIMIT 100
        `
      })

      return reply.send(runs)
    }
  )
}

export default ingestionRoutes
