import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest"
import { uuidv7 } from "uuidv7"

// VEL-61: runLinearAiImport is the extraction logic that now runs inside the
// ai-import worker (out of the request). Unit-tested here without a queue — only
// the AI + Linear network clients are mocked; the connection lookup hits the real
// (RLS-scoped) DB. Mock paths are two levels up to match how ai-import.ts resolves.
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"
process.env.VALKEY_URL = process.env.VALKEY_URL ?? "redis://localhost:6379"

vi.mock("../../lib/ai.js", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getAiClientForWorkspace: vi.fn(),
  getActiveProvider: vi.fn(async () => "anthropic"),
}))
vi.mock("../../lib/linear-client.js", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getLinearIssueDetail: vi.fn(),
}))
vi.mock("../../lib/encryption.js", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  decrypt: vi.fn(() => "fake-linear-token"),
}))

const sql = (await import("../../db/client.js")).sql
const { getAiClientForWorkspace } = await import("../../lib/ai.js")
const { getLinearIssueDetail } = await import("../../lib/linear-client.js")
const { runLinearAiImport } = await import("../../lib/ai-import.js")

const mockAiClient = getAiClientForWorkspace as unknown as ReturnType<typeof vi.fn>
const mockGetIssue = getLinearIssueDetail as unknown as ReturnType<typeof vi.fn>
const log = { warn: () => {}, error: () => {} }

describe("runLinearAiImport (VEL-61)", () => {
  const wsId = uuidv7()
  const userId = uuidv7()
  const projectId = uuidv7()
  const stamp = Date.now()

  beforeAll(async () => {
    await sql`INSERT INTO users (id, email, password_hash, email_verified)
      VALUES (${userId}::uuid, ${`ai-import-${stamp}@example.com`}, 'hash', true)`
    await sql`INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${wsId}::uuid, 'AI Import WS', ${`ai-import-${stamp}`}, 'free')`
    await sql`INSERT INTO workspace_members (id, workspace_id, user_id, role, is_active)
      VALUES (${uuidv7()}::uuid, ${wsId}::uuid, ${userId}::uuid, 'admin', true)`
    await sql`INSERT INTO projects (id, workspace_id, name, project_key, test_format)
      VALUES (${projectId}::uuid, ${wsId}::uuid, 'AI Project', 'aip', 'steps')`
  })

  afterEach(async () => {
    await sql`DELETE FROM linear_connections WHERE workspace_id = ${wsId}::uuid`
    vi.clearAllMocks()
  })

  afterAll(async () => {
    await sql`DELETE FROM projects WHERE workspace_id = ${wsId}::uuid`
    await sql`DELETE FROM workspace_members WHERE workspace_id = ${wsId}::uuid`
    await sql`DELETE FROM workspaces WHERE id = ${wsId}::uuid`
    await sql`DELETE FROM users WHERE id = ${userId}::uuid`
    await sql.end()
  })

  const connect = () => sql`INSERT INTO linear_connections
    (id, workspace_id, access_token_enc, api_key_enc, linear_org_id, team_id, team_name, connected_by)
    VALUES (${uuidv7()}::uuid, ${wsId}::uuid, NULL, 'enc-key', 'org', 'team-1', 'Eng', ${userId}::uuid)`

  const input = { workspaceId: wsId, projectId, issueId: "BUG-1", userId }

  it("returns error no_ai when no AI provider is configured", async () => {
    mockAiClient.mockResolvedValueOnce(null)
    const res = await runLinearAiImport(input, log)
    expect(res.status).toBe("error")
    expect(res.status === "error" && res.code).toBe("no_ai")
  })

  it("returns error no_connection when Linear isn't connected", async () => {
    mockAiClient.mockResolvedValueOnce({ complete: vi.fn() })
    const res = await runLinearAiImport(input, log)
    expect(res.status).toBe("error")
    expect(res.status === "error" && res.code).toBe("no_connection")
  })

  it("returns done with parsed cases on the happy path", async () => {
    await connect()
    mockAiClient.mockResolvedValueOnce({
      complete: vi.fn(async () =>
        '[{"title":"Login works","steps":[{"action":"open login","expected_result":"form shows"}]}]'
      ),
    })
    mockGetIssue.mockResolvedValueOnce({
      id: "iss1", identifier: "BUG-1", title: "Login", description: "As a user I can log in.", url: "https://linear.app/x",
    })

    const res = await runLinearAiImport(input, log)
    expect(res.status).toBe("done")
    if (res.status === "done") {
      expect(res.suggested_cases).toHaveLength(1)
      expect(res.suggested_cases[0]!.title).toBe("Login works")
      expect(res.parse_failed).toBe(false)
      expect(res.issue.identifier).toBe("BUG-1")
    }
  })

  it("returns error no_description when the issue has an empty description", async () => {
    await connect()
    mockAiClient.mockResolvedValueOnce({ complete: vi.fn() })
    mockGetIssue.mockResolvedValueOnce({
      id: "iss2", identifier: "BUG-2", title: "Empty", description: "", url: "https://linear.app/y",
    })

    const res = await runLinearAiImport(input, log)
    expect(res.status).toBe("error")
    expect(res.status === "error" && res.code).toBe("no_description")
  })
})
