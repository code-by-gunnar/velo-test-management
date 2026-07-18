import crypto from "node:crypto"
import Anthropic from "@anthropic-ai/sdk"
import OpenAI from "openai"
import { sql } from "../db/client.js"
import { withWorkspace } from "../db/tenant.js"
import { decrypt } from "./encryption.js"

export type AiProvider = "anthropic" | "openai" | "custom"
export type KeySource = "workspace" | "env"

/** Provider-agnostic text completion — the only surface the consumer needs. */
export interface AiClient {
  complete(prompt: string): Promise<string>
}

export const AI_PROVIDERS: readonly AiProvider[] = ["anthropic", "openai", "custom"] as const

export function isAiProvider(v: string): v is AiProvider {
  return v === "anthropic" || v === "openai" || v === "custom"
}

// Env fallback var + default model, per provider. 'custom' also has base-url/model env.
const ENV_KEY_VAR: Record<AiProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  custom: "CUSTOM_AI_API_KEY",
}
const DEFAULT_MODEL: Record<AiProvider, string | null> = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-4o",
  custom: null, // custom must specify its own model
}

export interface ProviderConfig {
  key: string
  source: KeySource
  baseUrl: string | null
  model: string | null
}

// Per-workspace client cache. Rebuilds when the active provider or its config changes.
const clientCache = new Map<string, { provider: AiProvider; configHash: string; client: AiClient }>()

function hashConfig(c: ProviderConfig): string {
  return crypto.createHash("sha256").update(`${c.key}|${c.baseUrl ?? ""}|${c.model ?? ""}`).digest("hex")
}

/**
 * Resolve config for a specific provider in a workspace.
 * Precedence: workspace-configured → instance env → none.
 */
export async function resolveProviderKey(
  workspaceId: string,
  provider: AiProvider
): Promise<ProviderConfig | null> {
  const rows = await withWorkspace(workspaceId, async (tx) => {
    return tx<{ secret_enc: string; base_url: string | null; model: string | null }[]>`
      SELECT secret_enc, base_url, model FROM workspace_integration_secrets
      WHERE workspace_id = current_setting('app.workspace_id', true)::uuid
        AND provider = ${provider}
    `
  })

  if (rows.length > 0) {
    const r = rows[0]!
    return {
      key: decrypt(r.secret_enc),
      source: "workspace",
      baseUrl: r.base_url,
      model: r.model ?? DEFAULT_MODEL[provider],
    }
  }

  const envKey = process.env[ENV_KEY_VAR[provider]]
  if (envKey) {
    return {
      key: envKey,
      source: "env",
      baseUrl: provider === "custom" ? (process.env.CUSTOM_AI_BASE_URL ?? null) : null,
      model: provider === "custom" ? (process.env.CUSTOM_AI_MODEL ?? null) : DEFAULT_MODEL[provider],
    }
  }

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

function buildClient(provider: AiProvider, config: ProviderConfig): AiClient | null {
  if (provider === "anthropic") {
    const client = new Anthropic({ apiKey: config.key, timeout: 60_000 })
    return {
      async complete(prompt: string) {
        const msg = await client.messages.create({
          model: config.model ?? DEFAULT_MODEL.anthropic!,
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt }],
        })
        return msg.content[0]?.type === "text" ? msg.content[0].text : ""
      },
    }
  }

  // openai + custom both use the OpenAI SDK; custom overrides baseURL and model.
  const model = provider === "openai" ? (config.model ?? DEFAULT_MODEL.openai!) : config.model
  if (!model) return null // custom without a model can't run
  const client = new OpenAI({
    apiKey: config.key,
    timeout: 60_000,
    ...(provider === "custom" && config.baseUrl ? { baseURL: config.baseUrl } : {}),
  })
  return {
    async complete(prompt: string) {
      const res = await client.chat.completions.create({
        model,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      })
      return res.choices[0]?.message?.content ?? ""
    },
  }
}

/**
 * Get a cached AI client for the workspace's ACTIVE provider, or null if that
 * provider is not fully configured (no key, or custom missing base_url/model).
 */
export async function getAiClientForWorkspace(workspaceId: string): Promise<AiClient | null> {
  const provider = await getActiveProvider(workspaceId)
  const config = await resolveProviderKey(workspaceId, provider)
  if (!config) return null
  if (provider === "custom" && (!config.baseUrl || !config.model)) return null

  const configHash = hashConfig(config)
  const cached = clientCache.get(workspaceId)
  if (cached && cached.provider === provider && cached.configHash === configHash) return cached.client

  const client = buildClient(provider, config)
  if (!client) return null
  clientCache.set(workspaceId, { provider, configHash, client })
  return client
}

/** Drop the cached client for a workspace. Call after a key or provider change. */
export function invalidateAiClient(workspaceId: string): void {
  clientCache.delete(workspaceId)
}

export interface ValidateInput {
  key: string
  baseUrl?: string | null
  model?: string | null
}

/**
 * Validate provider credentials. Anthropic/OpenAI use a no-token models.list().
 * Custom endpoints often don't implement /models, so we do a minimal 1-token
 * completion that confirms endpoint + key + model together. Never throws.
 *
 * NOTE: 'custom' deliberately allows private/localhost base URLs (Ollama, vLLM on
 * the operator's own LAN) — unlike webhook delivery, this is admin-configured
 * infrastructure, so no SSRF private-range block applies. We only sanity-check URL syntax.
 */
export async function validateProviderKey(provider: AiProvider, input: ValidateInput): Promise<boolean> {
  try {
    if (provider === "anthropic") {
      await new Anthropic({ apiKey: input.key, timeout: 15_000 }).models.list({ limit: 1 })
      return true
    }
    if (provider === "openai") {
      await new OpenAI({ apiKey: input.key, timeout: 15_000 }).models.list()
      return true
    }
    // custom
    if (!input.baseUrl || !input.model) return false
    try {
      new URL(input.baseUrl)
    } catch {
      return false
    }
    const client = new OpenAI({ apiKey: input.key, baseURL: input.baseUrl, timeout: 15_000 })
    await client.chat.completions.create({
      model: input.model,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    })
    return true
  } catch {
    return false
  }
}

export interface ProviderStatus {
  configured: boolean
  source: KeySource | null
  baseUrl: string | null
  model: string | null
}

export interface AiStatus {
  active: AiProvider
  providers: Record<AiProvider, ProviderStatus>
}

/** Per-provider configured state + the active provider, for the settings UI. */
export async function getAiStatus(workspaceId: string): Promise<AiStatus> {
  const [active, anthropic, openai, custom] = await Promise.all([
    getActiveProvider(workspaceId),
    resolveProviderKey(workspaceId, "anthropic"),
    resolveProviderKey(workspaceId, "openai"),
    resolveProviderKey(workspaceId, "custom"),
  ])
  const toStatus = (c: ProviderConfig | null): ProviderStatus => ({
    configured: c !== null,
    source: c?.source ?? null,
    baseUrl: c?.baseUrl ?? null,
    model: c?.model ?? null,
  })
  return {
    active,
    providers: {
      anthropic: toStatus(anthropic),
      openai: toStatus(openai),
      custom: toStatus(custom),
    },
  }
}
