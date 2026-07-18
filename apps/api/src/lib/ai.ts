import crypto from "node:crypto"
import Anthropic from "@anthropic-ai/sdk"
import OpenAI from "openai"
import { sql } from "../db/client.js"
import { withWorkspace } from "../db/tenant.js"
import { decrypt } from "./encryption.js"

export type AiProvider = "anthropic" | "openai"
export type KeySource = "workspace" | "env"

/** Provider-agnostic text completion — the only surface the consumer needs. */
export interface AiClient {
  complete(prompt: string): Promise<string>
}

export const AI_PROVIDERS: readonly AiProvider[] = ["anthropic", "openai"] as const

export function isAiProvider(v: string): v is AiProvider {
  return v === "anthropic" || v === "openai"
}

// Env fallback var + default model, per provider.
const ENV_VAR: Record<AiProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
}
const MODEL: Record<AiProvider, string> = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-4o",
}

// Per-workspace client cache. Rebuilds when the active provider or its key changes.
const clientCache = new Map<string, { provider: AiProvider; keyHash: string; client: AiClient }>()

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex")
}

/**
 * Resolve the key for a specific provider in a workspace.
 * Precedence: workspace-configured key → instance env key → none.
 */
export async function resolveProviderKey(
  workspaceId: string,
  provider: AiProvider
): Promise<{ key: string; source: KeySource } | null> {
  const rows = await withWorkspace(workspaceId, async (tx) => {
    return tx<{ secret_enc: string }[]>`
      SELECT secret_enc FROM workspace_integration_secrets
      WHERE workspace_id = current_setting('app.workspace_id', true)::uuid
        AND provider = ${provider}
    `
  })

  if (rows.length > 0) return { key: decrypt(rows[0]!.secret_enc), source: "workspace" }

  const envKey = process.env[ENV_VAR[provider]]
  if (envKey) return { key: envKey, source: "env" }

  return null
}

/** The workspace's active AI provider (defaults to anthropic). */
export async function getActiveProvider(workspaceId: string): Promise<AiProvider> {
  const rows = await sql<{ ai_provider: string }[]>`
    SELECT ai_provider FROM workspaces WHERE id = ${workspaceId}::uuid
  `
  const v = rows[0]?.ai_provider
  return v && isAiProvider(v) ? v : "anthropic"
}

export async function setActiveProvider(workspaceId: string, provider: AiProvider): Promise<void> {
  await sql`UPDATE workspaces SET ai_provider = ${provider}, updated_at = NOW() WHERE id = ${workspaceId}::uuid`
  clientCache.delete(workspaceId)
}

function buildClient(provider: AiProvider, key: string): AiClient {
  if (provider === "anthropic") {
    // 60s timeout — complex specs generate many cases; self-hosted has no gateway timeout.
    const client = new Anthropic({ apiKey: key, timeout: 60_000 })
    return {
      async complete(prompt: string) {
        const msg = await client.messages.create({
          model: MODEL.anthropic,
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt }],
        })
        return msg.content[0]?.type === "text" ? msg.content[0].text : ""
      },
    }
  }

  const client = new OpenAI({ apiKey: key, timeout: 60_000 })
  return {
    async complete(prompt: string) {
      const res = await client.chat.completions.create({
        model: MODEL.openai,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      })
      return res.choices[0]?.message?.content ?? ""
    },
  }
}

/**
 * Get a cached AI client for the workspace's ACTIVE provider, or null if that
 * provider has no key configured anywhere.
 */
export async function getAiClientForWorkspace(workspaceId: string): Promise<AiClient | null> {
  const provider = await getActiveProvider(workspaceId)
  const resolved = await resolveProviderKey(workspaceId, provider)
  if (!resolved) return null

  const keyHash = hashKey(resolved.key)
  const cached = clientCache.get(workspaceId)
  if (cached && cached.provider === provider && cached.keyHash === keyHash) return cached.client

  const client = buildClient(provider, resolved.key)
  clientCache.set(workspaceId, { provider, keyHash, client })
  return client
}

/** Drop the cached client for a workspace. Call after a key or provider change. */
export function invalidateAiClient(workspaceId: string): void {
  clientCache.delete(workspaceId)
}

/** Validate a key with a cheap, no-token models.list() call. Never throws. */
export async function validateProviderKey(provider: AiProvider, apiKey: string): Promise<boolean> {
  try {
    if (provider === "anthropic") {
      await new Anthropic({ apiKey, timeout: 15_000 }).models.list({ limit: 1 })
    } else {
      await new OpenAI({ apiKey, timeout: 15_000 }).models.list()
    }
    return true
  } catch {
    return false
  }
}

export interface AiStatus {
  active: AiProvider
  providers: Record<AiProvider, { configured: boolean; source: KeySource | null }>
}

/** Per-provider configured state + the active provider, for the settings UI. */
export async function getAiStatus(workspaceId: string): Promise<AiStatus> {
  const [active, anthropic, openai] = await Promise.all([
    getActiveProvider(workspaceId),
    resolveProviderKey(workspaceId, "anthropic"),
    resolveProviderKey(workspaceId, "openai"),
  ])
  return {
    active,
    providers: {
      anthropic: { configured: anthropic !== null, source: anthropic?.source ?? null },
      openai: { configured: openai !== null, source: openai?.source ?? null },
    },
  }
}
