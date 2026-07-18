import crypto from "node:crypto"
import Anthropic from "@anthropic-ai/sdk"
import { withWorkspace } from "../db/tenant.js"
import { decrypt } from "./encryption.js"

export type AnthropicKeySource = "workspace" | "env"

// Per-workspace client cache. Keyed by workspaceId; the stored key hash lets us
// detect rotation and rebuild. The Anthropic client is a thin fetch wrapper, so
// caching just avoids re-decrypting + reconstructing on every AI call.
const clientCache = new Map<string, { keyHash: string; client: Anthropic }>()

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex")
}

/**
 * Resolve the Anthropic API key for a workspace.
 * Precedence: workspace-configured key → instance ANTHROPIC_API_KEY → none.
 * Mirrors the Linear "prefer the stored key" pattern.
 */
export async function resolveAnthropicKey(
  workspaceId: string
): Promise<{ key: string; source: AnthropicKeySource } | null> {
  const rows = await withWorkspace(workspaceId, async (tx) => {
    return tx<{ secret_enc: string }[]>`
      SELECT secret_enc FROM workspace_integration_secrets
      WHERE workspace_id = current_setting('app.workspace_id', true)::uuid
        AND provider = 'anthropic'
    `
  })

  if (rows.length > 0) {
    return { key: decrypt(rows[0]!.secret_enc), source: "workspace" }
  }

  const envKey = process.env.ANTHROPIC_API_KEY
  if (envKey) return { key: envKey, source: "env" }

  return null
}

/**
 * Get a cached Anthropic client for a workspace, or null if no key is configured
 * anywhere. Rebuilds the client if the resolved key changed (rotation).
 */
export async function getAnthropicClientForWorkspace(workspaceId: string): Promise<Anthropic | null> {
  const resolved = await resolveAnthropicKey(workspaceId)
  if (!resolved) return null

  const keyHash = hashKey(resolved.key)
  const cached = clientCache.get(workspaceId)
  if (cached && cached.keyHash === keyHash) return cached.client

  // 60s timeout — complex specs generate many cases; self-hosted has no gateway timeout.
  const client = new Anthropic({ apiKey: resolved.key, timeout: 60_000 })
  clientCache.set(workspaceId, { keyHash, client })
  return client
}

/** Drop the cached client for a workspace. Call after a key is saved or removed. */
export function invalidateAnthropicClient(workspaceId: string): void {
  clientCache.delete(workspaceId)
}

/**
 * Validate a key with a cheap, no-token models.list() GET. Returns true if the
 * key authenticates. Never throws.
 */
export async function validateAnthropicKey(apiKey: string): Promise<boolean> {
  try {
    const client = new Anthropic({ apiKey, timeout: 15_000 })
    await client.models.list({ limit: 1 })
    return true
  } catch {
    return false
  }
}
