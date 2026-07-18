import { useState, useEffect, useCallback } from "react"
import { useCachedState } from "@/hooks/useCachedState"
import { Button, Card, CardHeader, CardTitle } from "@/components/ui"
import { clsx } from "clsx"
import { Trash2, Pencil, Zap, Check, X, Copy, Loader2 } from "lucide-react"

interface Webhook {
  id: string
  endpoint_url: string
  events: string[]
  active: boolean
  created_at: string
}

interface WebhookSettingsProps {
  workspaceId: string
  projectId: string
}

const AVAILABLE_EVENTS = [
  { key: "run.completed", label: "Run completed" },
  { key: "run_item.failed", label: "Run item failed" },
]

export function WebhookSettings({ workspaceId, projectId }: WebhookSettingsProps) {
  // Cached list renders instantly on revisit; the mount fetch refreshes it
  const [webhooks, setWebhooks, hadCache] = useCachedState<Webhook[]>(
    `velo:webhooks:${workspaceId}:${projectId}`,
    []
  )
  const [loading, setLoading] = useState(!hadCache)
  const [error, setError] = useState<string | null>(null)

  // Create form state
  const [showForm, setShowForm] = useState(false)
  const [newUrl, setNewUrl] = useState("")
  const [newEvents, setNewEvents] = useState<string[]>(["run.completed", "run_item.failed"])
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Newly created secret — shown once
  const [rawSecret, setRawSecret] = useState<string | null>(null)
  const [secretCopied, setSecretCopied] = useState(false)

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editUrl, setEditUrl] = useState("")
  const [editEvents, setEditEvents] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Test ping state
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; status: number } | null>>({})

  const basePath = `/api/backend/workspaces/${workspaceId}/projects/${projectId}/webhooks`

  const fetchWebhooks = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(basePath)
      if (!res.ok) {
        if (res.status === 404) {
          setWebhooks([])
          return
        }
        throw new Error(`Failed to load webhooks (${res.status})`)
      }
      const data = await res.json() as Webhook[]
      setWebhooks(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load webhooks")
    } finally {
      setLoading(false)
    }
  }, [basePath, setWebhooks])

  useEffect(() => {
    if (projectId) void fetchWebhooks()
  }, [fetchWebhooks, projectId])

  const isValidUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url)
      return parsed.protocol === "https:"
    } catch {
      return false
    }
  }

  const handleCreate = async () => {
    if (!newUrl.trim()) {
      setCreateError("Endpoint URL is required")
      return
    }
    if (!isValidUrl(newUrl.trim())) {
      setCreateError("Endpoint must be a valid HTTPS URL")
      return
    }
    if (newEvents.length === 0) {
      setCreateError("Select at least one event")
      return
    }

    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch(basePath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint_url: newUrl.trim(),
          events: newEvents,
        }),
      })
      if (!res.ok) {
        const body = await res.json() as { message?: string }
        throw new Error(body.message ?? `Failed to create webhook (${res.status})`)
      }
      const created = await res.json() as { id: string; secret: string }
      setRawSecret(created.secret)
      setNewUrl("")
      setNewEvents(["run.completed", "run_item.failed"])
      setShowForm(false)
      await fetchWebhooks()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create webhook")
    } finally {
      setCreating(false)
    }
  }

  const handleCopySecret = async () => {
    if (!rawSecret) return
    try {
      await navigator.clipboard.writeText(rawSecret)
      setSecretCopied(true)
      setTimeout(() => setSecretCopied(false), 2000)
    } catch {
      // Clipboard API not available
    }
  }

  const handleEdit = (webhook: Webhook) => {
    setEditingId(webhook.id)
    setEditUrl(webhook.endpoint_url)
    setEditEvents([...webhook.events])
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    if (!isValidUrl(editUrl.trim())) return

    setSaving(true)
    try {
      const res = await fetch(`${basePath}/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint_url: editUrl.trim(),
          events: editEvents,
        }),
      })
      if (!res.ok) throw new Error(`Failed to update webhook (${res.status})`)
      setEditingId(null)
      await fetchWebhooks()
    } catch {
      // Silent — user can retry
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (webhook: Webhook) => {
    try {
      const res = await fetch(`${basePath}/${webhook.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !webhook.active }),
      })
      if (!res.ok) throw new Error(`Failed to toggle webhook (${res.status})`)
      setWebhooks((prev) =>
        prev.map((w) => (w.id === webhook.id ? { ...w, active: !w.active } : w))
      )
    } catch {
      // Silent
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`${basePath}/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error(`Failed to delete webhook (${res.status})`)
      setWebhooks((prev) => prev.filter((w) => w.id !== id))
      setConfirmDeleteId(null)
    } catch {
      // Silent
    } finally {
      setDeletingId(null)
    }
  }

  const handleTestPing = async (id: string) => {
    setTestingId(id)
    setTestResult((prev) => ({ ...prev, [id]: null }))
    try {
      const res = await fetch(`${basePath}/${id}/test`, { method: "POST" })
      if (!res.ok) {
        setTestResult((prev) => ({ ...prev, [id]: { ok: false, status: res.status } }))
      } else {
        const data = await res.json() as { status_code: number; success: boolean }
        setTestResult((prev) => ({ ...prev, [id]: { ok: data.success, status: data.status_code } }))
      }
    } catch {
      setTestResult((prev) => ({ ...prev, [id]: { ok: false, status: 0 } }))
    } finally {
      setTestingId(null)
    }
  }

  const toggleEvent = (events: string[], event: string, setter: (v: string[]) => void) => {
    if (events.includes(event)) {
      setter(events.filter((e) => e !== event))
    } else {
      setter([...events, event])
    }
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })

  if (!projectId) {
    return (
      <Card>
        <p className="text-sm text-gray-500">Select a project to configure webhooks.</p>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Secret one-time display */}
      {rawSecret && (
        <div className="rounded-lg border border-primary/30 bg-primary-selected p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-primary">Webhook created</p>
            <button
              type="button"
              onClick={() => { setRawSecret(null); setSecretCopied(false) }}
              className="text-xs text-gray-500 underline hover:text-gray-700"
            >
              Dismiss
            </button>
          </div>
          <p className="mb-3 text-xs text-blocked-text font-medium bg-blocked-bg border border-blocked/20 rounded px-2 py-1.5">
            This signing secret will only be shown once. Copy it now.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded border border-gray-200 bg-white px-3 py-2 font-mono text-xs text-gray-800">
              {rawSecret}
            </code>
            <Button variant="secondary" size="sm" onClick={() => void handleCopySecret()}>
              {secretCopied ? (
                <><Check size={12} className="mr-1" /> Copied</>
              ) : (
                <><Copy size={12} className="mr-1" /> Copy</>
              )}
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Webhooks</CardTitle>
          {!showForm && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => { setShowForm(true); setCreateError(null) }}
            >
              Add Webhook
            </Button>
          )}
        </CardHeader>

        {/* Create form */}
        {showForm && (
          <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-4">
            <div className="mb-3">
              <label htmlFor="webhook-url" className="block text-xs font-medium text-gray-600 mb-1">
                Endpoint URL (HTTPS)
              </label>
              <input
                id="webhook-url"
                type="url"
                placeholder="https://example.com/webhooks/velo"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreate()
                  if (e.key === "Escape") {
                    setShowForm(false)
                    setNewUrl("")
                    setCreateError(null)
                  }
                }}
                autoFocus
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="mb-3">
              <p className="text-xs font-medium text-gray-600 mb-1.5">Events</p>
              <div className="flex flex-wrap gap-3">
                {AVAILABLE_EVENTS.map((evt) => (
                  <label key={evt.key} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newEvents.includes(evt.key)}
                      onChange={() => toggleEvent(newEvents, evt.key, setNewEvents)}
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    {evt.label}
                  </label>
                ))}
              </div>
            </div>
            {createError && (
              <p className="mb-2 text-xs text-fail-text">{createError}</p>
            )}
            <div className="flex gap-2">
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
                onClick={() => { setShowForm(false); setNewUrl(""); setCreateError(null) }}
                disabled={creating}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Webhook list */}
        {loading ? (
          <p className="text-sm text-gray-500">Loading webhooks...</p>
        ) : error ? (
          <p className="text-sm text-fail-text">{error}</p>
        ) : webhooks.length === 0 ? (
          <p className="text-sm text-gray-500">
            No webhooks configured. Add one to receive notifications when runs complete or tests fail.
          </p>
        ) : (
          <div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <th className="pb-2 pr-4">Endpoint</th>
                  <th className="pb-2 pr-4">Events</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Created</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {webhooks.map((webhook) => {
                  const isEditing = editingId === webhook.id
                  const result = testResult[webhook.id]

                  if (isEditing) {
                    return (
                      <tr key={webhook.id} className="border-b border-gray-50">
                        <td className="py-2.5 pr-4">
                          <input
                            type="url"
                            value={editUrl}
                            onChange={(e) => setEditUrl(e.target.value)}
                            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </td>
                        <td className="py-2.5 pr-4">
                          <div className="flex flex-wrap gap-2">
                            {AVAILABLE_EVENTS.map((evt) => (
                              <label key={evt.key} className="flex items-center gap-1 text-xs cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editEvents.includes(evt.key)}
                                  onChange={() => toggleEvent(editEvents, evt.key, setEditEvents)}
                                  className="rounded border-gray-300 text-primary focus:ring-primary"
                                />
                                {evt.label}
                              </label>
                            ))}
                          </div>
                        </td>
                        <td colSpan={2} />
                        <td className="py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => void handleSaveEdit()}
                              disabled={saving}
                            >
                              {saving ? "Saving..." : "Save"}
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setEditingId(null)}
                              disabled={saving}
                            >
                              Cancel
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  }

                  return (
                    <tr key={webhook.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2.5 pr-4">
                        <span className="font-mono text-xs text-gray-700 truncate block" title={webhook.endpoint_url}>
                          {webhook.endpoint_url}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <div className="flex flex-wrap gap-1">
                          {webhook.events.map((evt) => (
                            <span
                              key={evt}
                              className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                            >
                              {evt}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 pr-4">
                        <button
                          type="button"
                          onClick={() => void handleToggleActive(webhook)}
                          className={clsx(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
                            webhook.active
                              ? "border-pass/20 bg-pass-bg text-pass-text"
                              : "border-gray-200 bg-gray-50 text-gray-400"
                          )}
                        >
                          {webhook.active ? "Active" : "Paused"}
                        </button>
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-gray-500">
                        {formatDate(webhook.created_at)}
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Test ping result */}
                          {result && (
                            <span className={clsx(
                              "flex items-center gap-1 text-xs font-medium",
                              result.ok ? "text-pass-text" : "text-fail-text"
                            )}>
                              {result.ok ? <Check size={12} /> : <X size={12} />}
                              {result.status > 0 ? result.status : "Err"}
                            </span>
                          )}

                          {/* Test ping button */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleTestPing(webhook.id)}
                            disabled={testingId === webhook.id}
                            title="Send test ping"
                          >
                            {testingId === webhook.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Zap size={14} />
                            )}
                          </Button>

                          {/* Edit */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(webhook)}
                            title="Edit webhook"
                          >
                            <Pencil size={14} />
                          </Button>

                          {/* Delete */}
                          {confirmDeleteId === webhook.id ? (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => void handleDelete(webhook.id)}
                                disabled={deletingId === webhook.id}
                              >
                                {deletingId === webhook.id ? "..." : "Yes"}
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setConfirmDeleteId(null)}
                              >
                                No
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmDeleteId(webhook.id)}
                              title="Delete webhook"
                            >
                              <Trash2 size={14} />
                            </Button>
                          )}
                        </div>
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
