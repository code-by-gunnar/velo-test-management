import { useState, useEffect, useCallback } from "react"
import { Button, Card, CardHeader, CardTitle, Input, FormField } from "@/components/ui"
import { clsx } from "clsx"

interface ApiKey {
  id: string
  name: string
  key_prefix: string
  created_at: string
  revoked_at: string | null
}

interface ApiKeysPanelProps {
  workspaceId: string
}

export function ApiKeysPanel({ workspaceId }: ApiKeysPanelProps) {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // New key form state
  const [showForm, setShowForm] = useState(false)
  const [newKeyName, setNewKeyName] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Newly created raw key — shown once
  const [rawKey, setRawKey] = useState<string | null>(null)
  const [rawKeyCopied, setRawKeyCopied] = useState(false)

  // Revoke state
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const fetchKeys = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/backend/workspaces/${workspaceId}/api-keys`)
      if (!res.ok) throw new Error(`Failed to load API keys (${res.status})`)
      const data = await res.json() as ApiKey[]
      setKeys(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load API keys")
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void fetchKeys()
  }, [fetchKeys])

  const handleCreate = async () => {
    if (!newKeyName.trim()) {
      setCreateError("Key name is required")
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch(`/api/backend/workspaces/${workspaceId}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      })
      if (!res.ok) {
        const body = await res.json() as { message?: string }
        throw new Error(body.message ?? `Failed to create key (${res.status})`)
      }
      const created = await res.json() as { id: string; name: string; key: string; prefix: string }
      setRawKey(created.key)
      setKeys((prev) => [{
        id: created.id,
        name: created.name,
        key_prefix: created.prefix,
        created_at: new Date().toISOString(),
        revoked_at: null,
      }, ...prev])
      setNewKeyName("")
      setShowForm(false)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create API key")
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (keyId: string) => {
    setRevokingId(keyId)
    try {
      const res = await fetch(`/api/backend/workspaces/${workspaceId}/api-keys/${keyId}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error(`Failed to revoke key (${res.status})`)
      setKeys((prev) =>
        prev.map((k) =>
          k.id === keyId ? { ...k, revoked_at: new Date().toISOString() } : k
        )
      )
    } catch {
      // Silently ignore revoke errors — user can retry
    } finally {
      setRevokingId(null)
    }
  }

  const handleCopyRaw = async () => {
    if (!rawKey) return
    try {
      await navigator.clipboard.writeText(rawKey)
      setRawKeyCopied(true)
      setTimeout(() => setRawKeyCopied(false), 2000)
    } catch {
      // Clipboard API not available — noop
    }
  }

  const handleDismissRaw = () => {
    setRawKey(null)
    setRawKeyCopied(false)
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })

  return (
    <div className="flex flex-col gap-4">
      {/* Raw key one-time display */}
      {rawKey && (
        <div className="rounded-lg border border-primary/30 bg-primary-selected p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-primary">API key created</p>
            <button
              type="button"
              onClick={handleDismissRaw}
              className="text-xs text-gray-500 underline hover:text-gray-700"
            >
              Dismiss
            </button>
          </div>
          <p className="mb-3 text-xs text-blocked-text font-medium bg-blocked-bg border border-blocked/20 rounded px-2 py-1.5">
            This key will only be shown once. Copy it now — you will not be able to see it again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded border border-gray-200 bg-white px-3 py-2 font-mono text-xs text-gray-800">
              {rawKey}
            </code>
            <Button variant="secondary" size="sm" onClick={() => void handleCopyRaw()}>
              {rawKeyCopied ? "Copied!" : "Copy"}
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
          {!showForm && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setShowForm(true)
                setCreateError(null)
              }}
            >
              Create API Key
            </Button>
          )}
        </CardHeader>

        {/* Create form */}
        {showForm && (
          <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-4">
            <FormField label="Key name" htmlFor="api-key-name" error={createError ?? undefined}>
              <Input
                id="api-key-name"
                placeholder="e.g. CI pipeline — GitHub Actions"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreate()
                  if (e.key === "Escape") {
                    setShowForm(false)
                    setNewKeyName("")
                    setCreateError(null)
                  }
                }}
                autoFocus
              />
            </FormField>
            <div className="mt-3 flex gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleCreate()}
                disabled={creating}
              >
                {creating ? "Creating..." : "Create"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowForm(false)
                  setNewKeyName("")
                  setCreateError(null)
                }}
                disabled={creating}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Keys table */}
        {loading ? (
          <p className="text-sm text-gray-500">Loading API keys...</p>
        ) : error ? (
          <p className="text-sm text-fail-text">{error}</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-gray-500">
            No API keys yet. Create one to use with your CI pipeline.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">Key prefix</th>
                  <th className="pb-2 pr-4">Created</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => {
                  const isRevoked = key.revoked_at !== null
                  return (
                    <tr
                      key={key.id}
                      className={clsx(
                        "border-b border-gray-50 last:border-0",
                        isRevoked && "opacity-50"
                      )}
                    >
                      <td className="py-2.5 pr-4 font-medium text-gray-900">{key.name}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-gray-500">
                        {key.key_prefix}...
                      </td>
                      <td className="py-2.5 pr-4 text-gray-500">{formatDate(key.created_at)}</td>
                      <td className="py-2.5 pr-4">
                        {isRevoked ? (
                          <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-400">
                            Revoked
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-pass/20 bg-pass-bg px-2 py-0.5 text-xs font-medium text-pass-text">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        {!isRevoked && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => void handleRevoke(key.id)}
                            disabled={revokingId === key.id}
                          >
                            {revokingId === key.id ? "Revoking..." : "Revoke"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
