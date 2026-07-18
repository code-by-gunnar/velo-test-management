import { useState, useEffect, useCallback } from "react"
import { useCachedState } from "@/hooks/useCachedState"
import { Button } from "@/components/ui"
import { Sparkles, Trash2 } from "lucide-react"

interface AiStatus {
  configured: boolean
  source: "workspace" | "env" | null
}

interface ClaudeConnectProps {
  workspaceId: string
}

export function ClaudeConnect({ workspaceId }: ClaudeConnectProps) {
  const [status, setStatus, hadCache] = useCachedState<AiStatus | null>(
    `velo:ai:${workspaceId}`,
    null
  )
  const [loading, setLoading] = useState(!hadCache || !status)
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/backend/workspaces/${workspaceId}/ai/status`)
      if (res.ok) setStatus((await res.json()) as AiStatus)
    } catch {
      /* keep cached value */
    } finally {
      setLoading(false)
    }
  }, [workspaceId, setStatus])

  useEffect(() => {
    void fetchStatus()
  }, [fetchStatus])

  const handleSave = async () => {
    if (!apiKeyInput.trim()) return
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const res = await fetch(`/api/backend/workspaces/${workspaceId}/ai/api-key`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKeyInput.trim() }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `Failed to save key (${res.status})`)
      }
      setApiKeyInput("")
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      await fetchStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save API key")
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    setRemoving(true)
    setError(null)
    try {
      const res = await fetch(`/api/backend/workspaces/${workspaceId}/ai/api-key`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error(`Failed to remove key (${res.status})`)
      await fetchStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove API key")
    } finally {
      setRemoving(false)
    }
  }

  const hasWorkspaceKey = status?.configured && status.source === "workspace"
  const usingEnvDefault = status?.configured && status.source === "env"

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={18} className="text-primary" aria-hidden="true" />
        <h4 className="text-sm font-semibold text-gray-900">Claude</h4>
        {hasWorkspaceKey && (
          <span className="inline-flex items-center rounded-full bg-pass-bg px-1.5 py-0.5 text-[10px] font-medium text-pass-text">
            Configured
          </span>
        )}
        {usingEnvDefault && (
          <span className="inline-flex items-center rounded-full bg-blocked-bg px-1.5 py-0.5 text-[10px] font-medium text-blocked-text">
            Instance default
          </span>
        )}
        {!loading && !status?.configured && (
          <span className="inline-flex items-center rounded-full bg-blocked-bg px-1.5 py-0.5 text-[10px] font-medium text-blocked-text">
            Required
          </span>
        )}
      </div>

      {error && <p className="mb-3 text-xs text-fail-text">{error}</p>}

      {loading ? (
        <p className="mt-2 text-sm text-gray-400">Checking Claude configuration...</p>
      ) : (
        <div className="mt-3">
          <p className="text-sm text-gray-500 mb-3">
            {hasWorkspaceKey
              ? "A workspace API key is set. AI test generation uses this key."
              : usingEnvDefault
                ? "Falling back to the instance-wide ANTHROPIC_API_KEY. Add a workspace key below to override it."
                : "Add your Anthropic API key to generate test cases from specs with Claude."}
          </p>

          <div className="flex items-center gap-2">
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={hasWorkspaceKey ? "Replace API key..." : "sk-ant-..."}
              onKeyDown={(e) => {
                if (e.key === "Enter" && apiKeyInput.trim() && !saving) void handleSave()
              }}
              className="flex-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleSave()}
              disabled={!apiKeyInput.trim() || saving}
            >
              {saving ? "Validating..." : hasWorkspaceKey ? "Save" : "Connect"}
            </Button>
          </div>

          {success && <p className="mt-1.5 text-xs text-pass-text">API key saved and validated.</p>}

          {hasWorkspaceKey && (
            <div className="mt-3">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void handleRemove()}
                disabled={removing}
              >
                <Trash2 size={14} className="mr-1.5" />
                {removing ? "Removing..." : "Remove key"}
              </Button>
            </div>
          )}

          <p className="mt-2 text-[10px] text-gray-400">
            Generate a key at console.anthropic.com &gt; Settings &gt; API Keys.
          </p>
        </div>
      )}
    </div>
  )
}
