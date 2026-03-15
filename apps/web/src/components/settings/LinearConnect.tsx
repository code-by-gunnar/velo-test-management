import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui"
import { Link, Unlink, ChevronDown, ExternalLink } from "lucide-react"

interface LinearStatus {
  connected: boolean
  org_name?: string
  team_name?: string
  team_id?: string
  connected_at?: string
  connected_by_name?: string
  teams?: Array<{ id: string; name: string }>
  needs_team_selection?: boolean
  has_api_key?: boolean
}

interface LinearConnectProps {
  workspaceId: string
}

type ConnectState = "loading" | "disconnected" | "team-selection" | "connected"

export function LinearConnect({ workspaceId }: LinearConnectProps) {
  const [state, setState] = useState<ConnectState>("loading")
  const [status, setStatus] = useState<LinearStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [selectedTeamId, setSelectedTeamId] = useState("")
  const [savingTeam, setSavingTeam] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [savingApiKey, setSavingApiKey] = useState(false)
  const [apiKeySuccess, setApiKeySuccess] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/backend/workspaces/${workspaceId}/linear/status`)
      if (!res.ok) {
        // If 404, Linear routes may not exist yet — show disconnected state
        if (res.status === 404) {
          setState("disconnected")
          return
        }
        throw new Error(`Failed to check Linear status (${res.status})`)
      }
      const data = await res.json() as LinearStatus
      setStatus(data)

      if (data.connected && data.team_id) {
        setState("connected")
      } else if (data.connected && data.needs_team_selection) {
        // Fetch cached teams for selection
        try {
          const teamsRes = await fetch(`/api/backend/workspaces/${workspaceId}/linear/teams`)
          if (teamsRes.ok) {
            const teamsData = await teamsRes.json() as { teams: Array<{ id: string; name: string }> }
            setStatus({ ...data, teams: teamsData.teams })
          }
        } catch { /* teams fetch failed — still show selection state */ }
        setState("team-selection")
      } else {
        setState("disconnected")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check Linear status")
      setState("disconnected")
    }
  }, [workspaceId])

  useEffect(() => {
    void fetchStatus()
  }, [fetchStatus])

  // Check for OAuth callback redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("linear_callback") === "success") {
      // Remove query param from URL
      const url = new URL(window.location.href)
      url.searchParams.delete("linear_callback")
      window.history.replaceState({}, "", url.toString())
      // Re-fetch status to get team selection
      void fetchStatus()
    }
  }, [fetchStatus])

  const handleConnect = async () => {
    setConnecting(true)
    setError(null)
    try {
      const res = await fetch(`/api/backend/workspaces/${workspaceId}/linear/auth`)
      if (!res.ok) throw new Error(`Failed to start Linear connection (${res.status})`)
      const data = await res.json() as { url: string }
      if (!/^https:\/\/linear\.app\b/i.test(data.url)) throw new Error("Unexpected redirect URL")
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to Linear")
      setConnecting(false)
    }
  }

  const handleSelectTeam = async () => {
    if (!selectedTeamId) return
    setSavingTeam(true)
    setError(null)
    try {
      const res = await fetch(`/api/backend/workspaces/${workspaceId}/linear/team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_id: selectedTeamId }),
      })
      if (!res.ok) throw new Error(`Failed to select team (${res.status})`)
      await fetchStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save team selection")
    } finally {
      setSavingTeam(false)
    }
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    setError(null)
    try {
      const res = await fetch(`/api/backend/workspaces/${workspaceId}/linear/disconnect`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error(`Failed to disconnect Linear (${res.status})`)
      setStatus(null)
      setState("disconnected")
      setConfirmDisconnect(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect Linear")
    } finally {
      setDisconnecting(false)
    }
  }

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) return
    setSavingApiKey(true)
    setError(null)
    setApiKeySuccess(false)
    try {
      const res = await fetch(`/api/backend/workspaces/${workspaceId}/linear/api-key`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKeyInput.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? `Failed to save API key (${res.status})`)
      }
      setApiKeyInput("")
      setApiKeySuccess(true)
      setTimeout(() => setApiKeySuccess(false), 3000)
      await fetchStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save API key")
    } finally {
      setSavingApiKey(false)
    }
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })

  if (state === "loading") {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <p className="text-sm text-gray-400">Checking Linear connection...</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2 mb-1">
        <svg width="20" height="20" viewBox="0 0 100 100" fill="none" aria-hidden="true">
          <path
            d="M2.3 46.2A49.9 49.9 0 0 0 46.2 97.7L2.3 46.2Zm3.1 12.1 36.3 42.4A50 50 0 0 0 97.7 53.8L53.8 2.3A50 50 0 0 0 5.4 58.3Zm91.5-12.1L53.8 2.3"
            fill="#5E6AD2"
          />
        </svg>
        <h4 className="text-sm font-semibold text-gray-900">Linear</h4>
      </div>

      {error && (
        <p className="mb-3 text-xs text-fail-text">{error}</p>
      )}

      {/* Disconnected state */}
      {state === "disconnected" && (
        <div className="mt-3">
          <p className="text-sm text-gray-500 mb-4">
            Connect your Linear workspace to file defects directly from failed test runs.
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleConnect()}
            disabled={connecting}
          >
            <Link size={14} className="mr-1.5" />
            {connecting ? "Connecting..." : "Connect Linear"}
          </Button>
        </div>
      )}

      {/* Team selection state */}
      {state === "team-selection" && status?.teams && (
        <div className="mt-3">
          <p className="text-sm text-gray-500 mb-3">
            Select a default team for defect issues:
          </p>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <select
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="w-full appearance-none rounded-md border border-gray-200 bg-white px-3 py-1.5 pr-8 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Select a team...</option>
                {status.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleSelectTeam()}
              disabled={!selectedTeamId || savingTeam}
            >
              {savingTeam ? "Saving..." : "Confirm"}
            </Button>
          </div>
        </div>
      )}

      {/* Connected state */}
      {state === "connected" && status && (
        <div className="mt-3">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center rounded-full border border-pass/20 bg-pass-bg px-2 py-0.5 text-xs font-medium text-pass-text">
              Connected
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-4">
            {status.org_name && (
              <>
                <dt className="text-gray-500">Organization</dt>
                <dd className="text-gray-900 font-medium">{status.org_name}</dd>
              </>
            )}
            {status.team_name && (
              <>
                <dt className="text-gray-500">Default team</dt>
                <dd className="text-gray-900 font-medium">{status.team_name}</dd>
              </>
            )}
            {status.connected_at && (
              <>
                <dt className="text-gray-500">Connected</dt>
                <dd className="text-gray-900">{formatDate(status.connected_at)}</dd>
              </>
            )}
            {status.connected_by_name && (
              <>
                <dt className="text-gray-500">Connected by</dt>
                <dd className="text-gray-900">{status.connected_by_name}</dd>
              </>
            )}
          </dl>

          {/* API Key section */}
          <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center gap-2 mb-1">
              <h5 className="text-xs font-semibold text-gray-700">API Key</h5>
              {status.has_api_key && (
                <span className="inline-flex items-center rounded-full bg-pass-bg px-1.5 py-0.5 text-[10px] font-medium text-pass-text">
                  Configured
                </span>
              )}
              {!status.has_api_key && (
                <span className="inline-flex items-center rounded-full bg-blocked-bg px-1.5 py-0.5 text-[10px] font-medium text-blocked-text">
                  Required
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mb-2">
              {status.has_api_key
                ? "API key is configured. Defects and imports use this key instead of OAuth."
                : "Add a Linear API key for reliable integration. OAuth tokens expire — API keys don't."
              }
            </p>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={status.has_api_key ? "Replace API key..." : "lin_api_..."}
                className="flex-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-900 placeholder-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleSaveApiKey()}
                disabled={!apiKeyInput.trim() || savingApiKey}
              >
                {savingApiKey ? "Validating..." : "Save"}
              </Button>
            </div>
            {apiKeySuccess && (
              <p className="mt-1.5 text-xs text-pass-text">API key saved and validated.</p>
            )}
            <p className="mt-2 text-[10px] text-gray-400">
              Generate a key in Linear: Settings &gt; Account &gt; Security &amp; Access &gt; API Keys
            </p>
          </div>

          {confirmDisconnect ? (
            <div className="rounded-md border border-fail/20 bg-fail-bg p-3">
              <p className="text-xs text-fail-text mb-2">
                This will stop syncing defects with Linear. Existing links will be preserved.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void handleDisconnect()}
                  disabled={disconnecting}
                >
                  {disconnecting ? "Disconnecting..." : "Confirm Disconnect"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirmDisconnect(false)}
                  disabled={disconnecting}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmDisconnect(true)}
            >
              <Unlink size={14} className="mr-1.5" />
              Disconnect
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
