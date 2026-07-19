import { useState, useEffect, useCallback } from "react"
import Image from "next/image"
import { useCachedState } from "@/hooks/useCachedState"
import { Button } from "@/components/ui"
import { ChevronDown, Trash2, Boxes } from "lucide-react"

type Provider = "anthropic" | "openai" | "custom"
const PROVIDERS: Provider[] = ["anthropic", "openai", "custom"]

interface ProviderState {
  configured: boolean
  source: "workspace" | "env" | null
  baseUrl: string | null
  model: string | null
}

interface AiStatus {
  active: Provider
  providers: Record<Provider, ProviderState>
}

const PROVIDER_META: Record<Provider, { label: string; option: string; logo: string | null; placeholder: string; keyHint: string; envVar: string }> = {
  anthropic: {
    label: "Claude", option: "Claude (Anthropic)", logo: "/claude-logo.svg",
    placeholder: "sk-ant-...", keyHint: "console.anthropic.com > Settings > API Keys", envVar: "ANTHROPIC_API_KEY",
  },
  openai: {
    label: "OpenAI", option: "OpenAI", logo: "/openai-logo.svg",
    placeholder: "sk-...", keyHint: "platform.openai.com > API keys", envVar: "OPENAI_API_KEY",
  },
  custom: {
    label: "Custom", option: "Custom (OpenAI-compatible)", logo: null,
    placeholder: "API key (any value if your server needs none)", keyHint: "your LLM server's settings", envVar: "CUSTOM_AI_API_KEY",
  },
}

interface AiProviderConnectProps {
  workspaceId: string
}

export function AiProviderConnect({ workspaceId }: AiProviderConnectProps) {
  const [status, setStatus, hadCache] = useCachedState<AiStatus | null>(`velo:ai:${workspaceId}`, null)
  const [selected, setSelected] = useState<Provider>(status?.active ?? "anthropic")
  const [loading, setLoading] = useState(!hadCache || !status)
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [baseUrlInput, setBaseUrlInput] = useState("")
  const [modelInput, setModelInput] = useState("")
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Centralized: apply a fresh status, syncing selection + prefilling custom config.
  const applyStatus = useCallback((s: AiStatus) => {
    setStatus(s)
    setSelected(s.active)
    if (s.providers.custom.configured) {
      setBaseUrlInput(s.providers.custom.baseUrl ?? "")
      setModelInput(s.providers.custom.model ?? "")
    }
  }, [setStatus])

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/backend/workspaces/${workspaceId}/ai/status`)
      if (res.ok) applyStatus((await res.json()) as AiStatus)
    } catch {
      /* keep cached value */
    } finally {
      setLoading(false)
    }
  }, [workspaceId, applyStatus])

  useEffect(() => {
    void fetchStatus()
  }, [fetchStatus])

  // The provider holding a workspace key (at most one — configuring locks it in).
  const lockedProvider = PROVIDERS.find((p) => status?.providers?.[p]?.source === "workspace") ?? null
  const effective: Provider = lockedProvider ?? selected
  const isCustom = effective === "custom"

  const handleSelectProvider = async (provider: Provider) => {
    if (lockedProvider) return
    setSelected(provider)
    setError(null)
    setApiKeyInput("")
    setBaseUrlInput("")
    setModelInput("")
    setSwitching(true)
    try {
      const res = await fetch(`/api/backend/workspaces/${workspaceId}/ai/provider`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      })
      if (res.ok) setStatus((await res.json()) as AiStatus)
    } catch {
      /* status refetches on next mount */
    } finally {
      setSwitching(false)
    }
  }

  const handleSave = async () => {
    if (!apiKeyInput.trim()) return
    if (isCustom && (!baseUrlInput.trim() || !modelInput.trim())) return
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const body: Record<string, string> = { api_key: apiKeyInput.trim() }
      if (isCustom) {
        body.base_url = baseUrlInput.trim()
        body.model = modelInput.trim()
      }
      const res = await fetch(`/api/backend/workspaces/${workspaceId}/ai/keys/${effective}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `Failed to save (${res.status})`)
      }
      applyStatus((await res.json()) as AiStatus)
      setApiKeyInput("")
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    setRemoving(true)
    setError(null)
    try {
      const res = await fetch(`/api/backend/workspaces/${workspaceId}/ai/keys/${effective}`, { method: "DELETE" })
      if (!res.ok) throw new Error(`Failed to remove key (${res.status})`)
      const s = (await res.json()) as AiStatus
      setStatus(s)
      setSelected(s.active)
      setBaseUrlInput("")
      setModelInput("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove API key")
    } finally {
      setRemoving(false)
    }
  }

  const meta = PROVIDER_META[effective]
  const state = status?.providers?.[effective]
  const hasWorkspaceKey = state?.configured && state.source === "workspace"
  const usingEnvDefault = state?.configured && state.source === "env"
  const saveDisabled = !apiKeyInput.trim() || saving || (isCustom && (!baseUrlInput.trim() || !modelInput.trim()))

  const inputClass = "w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2 mb-1">
        {meta.logo
          ? <Image src={meta.logo} alt="" aria-hidden="true" width={20} height={20} />
          : <Boxes size={18} className="text-gray-500" aria-hidden="true" />}
        <h4 className="text-sm font-semibold text-gray-900">AI test generation</h4>
        {hasWorkspaceKey && (
          <span className="inline-flex items-center rounded-full bg-pass-bg px-1.5 py-0.5 text-[10px] font-medium text-pass-text">Configured</span>
        )}
        {usingEnvDefault && (
          <span className="inline-flex items-center rounded-full bg-blocked-bg px-1.5 py-0.5 text-[10px] font-medium text-blocked-text">Instance default</span>
        )}
        {!loading && state && !state.configured && (
          <span className="inline-flex items-center rounded-full bg-blocked-bg px-1.5 py-0.5 text-[10px] font-medium text-blocked-text">Required</span>
        )}
      </div>

      {error && <p className="mb-3 text-xs text-fail-text">{error}</p>}

      {loading ? (
        <p className="mt-2 text-sm text-gray-400">Checking AI configuration...</p>
      ) : (
        <div className="mt-3">
          <p className="text-sm text-gray-500 mb-3">
            Choose the AI provider used to generate test cases from specs, then add its API key.
          </p>

          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-gray-500">Provider</label>
            <div className="relative w-full max-w-[260px]">
              <select
                value={effective}
                disabled={switching || Boolean(lockedProvider)}
                onChange={(e) => void handleSelectProvider(e.target.value as Provider)}
                className="w-full appearance-none rounded-md border border-gray-200 bg-white px-3 py-1.5 pr-8 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-gray-50 disabled:text-gray-500"
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p} disabled={Boolean(lockedProvider) && p !== lockedProvider}>
                    {PROVIDER_META[p].option}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
            {lockedProvider && (
              <p className="mt-1 text-[11px] text-gray-400">Remove the {meta.label} key below to switch providers.</p>
            )}
          </div>

          {usingEnvDefault && (
            <p className="mb-2 text-xs text-gray-500">
              Falling back to this instance&apos;s {meta.envVar}. Add a workspace key below to override it.
            </p>
          )}

          {isCustom && (
            <div className="mb-3 space-y-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Base URL</label>
                <input
                  type="text"
                  value={baseUrlInput}
                  onChange={(e) => setBaseUrlInput(e.target.value)}
                  placeholder="http://host.docker.internal:11434/v1"
                  className={inputClass}
                />
                <p className="mt-1 text-[10px] text-gray-400">
                  Any OpenAI-compatible server (Ollama, vLLM, LM Studio, OpenRouter…). From Docker,
                  use <code className="font-mono">host.docker.internal</code> or the LAN IP — not <code className="font-mono">localhost</code>.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Model</label>
                <input
                  type="text"
                  value={modelInput}
                  onChange={(e) => setModelInput(e.target.value)}
                  placeholder="e.g. qwen2.5-coder"
                  className={inputClass}
                />
              </div>
              <p className="text-[10px] text-gray-400">
                Import quality scales with the model and hardware behind this endpoint. Smaller local
                models may return fewer or less detailed test cases than hosted providers — try a larger
                model if results feel thin.
              </p>
            </div>
          )}

          <label className="mb-1 block text-xs font-medium text-gray-500">{meta.label} API key</label>
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={hasWorkspaceKey ? "Replace API key..." : meta.placeholder}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !saveDisabled) void handleSave()
              }}
              className={`flex-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary`}
            />
            <Button variant="primary" size="sm" onClick={() => void handleSave()} disabled={saveDisabled}>
              {saving ? "Validating..." : hasWorkspaceKey ? "Save" : "Connect"}
            </Button>
          </div>

          {success && <p className="mt-1.5 text-xs text-pass-text">Saved and validated.</p>}

          {hasWorkspaceKey && (
            <div className="mt-3">
              <Button variant="destructive" size="sm" onClick={() => void handleRemove()} disabled={removing}>
                <Trash2 size={14} className="mr-1.5" />
                {removing ? "Removing..." : "Remove key"}
              </Button>
            </div>
          )}

          {!isCustom && <p className="mt-2 text-[10px] text-gray-400">Generate a key at {meta.keyHint}.</p>}
        </div>
      )}
    </div>
  )
}
