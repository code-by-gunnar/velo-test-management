import { useState, useEffect, useCallback } from "react"
import { useCachedState } from "@/hooks/useCachedState"
import { Button, Card, CardHeader, CardTitle } from "@/components/ui"

interface AuditEntry {
  id: string
  action: string
  target_type: string | null
  target_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  actor_user_name: string | null
  actor_user_email: string | null
  actor_api_key_name: string | null
}

interface AuditLogPanelProps {
  workspaceId: string
}

// Friendly labels for the closed AuditAction set (see lib/audit-log.ts). Kept in
// sync with that taxonomy — an unmapped action falls back to the raw string.
const ACTION_LABELS: Record<string, string> = {
  "role.changed": "Role changed",
  "api_key.created": "API key created",
  "api_key.revoked": "API key revoked",
  "integration.connected": "Integration connected",
  "integration.disconnected": "Integration disconnected",
  "webhook.created": "Webhook created",
  "webhook.updated": "Webhook updated",
  "webhook.deleted": "Webhook deleted",
  "workspace.exported": "Workspace exported",
  "recycle.purged": "Recycle bin purged",
  "recycle.bulk_deleted": "Bulk deleted",
}

function actorLabel(e: AuditEntry): string {
  if (e.actor_user_name) return e.actor_user_name
  if (e.actor_user_email) return e.actor_user_email
  if (e.actor_api_key_name) return `API key: ${e.actor_api_key_name}`
  return "System"
}

function metaSummary(metadata: Record<string, unknown> | null): string {
  if (!metadata) return ""
  return Object.entries(metadata)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ")
}

export function AuditLogPanel({ workspaceId }: AuditLogPanelProps) {
  const [entries, setEntries, hadCache] = useCachedState<AuditEntry[]>(
    `velo:audit-log:${workspaceId}`,
    []
  )
  const [loading, setLoading] = useState(!hadCache)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchPage = useCallback(async (before: string | null, append: boolean) => {
    setError(null)
    try {
      const qs = new URLSearchParams({ limit: "50" })
      if (before) qs.set("before", before)
      const res = await fetch(`/api/backend/workspaces/${workspaceId}/audit-log?${qs.toString()}`)
      if (!res.ok) throw new Error(`Failed to load audit log (${res.status})`)
      const data = await res.json() as { entries: AuditEntry[]; next_before: string | null }
      setEntries((prev) => (append ? [...prev, ...data.entries] : data.entries))
      setNextBefore(data.next_before)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit log")
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [workspaceId, setEntries])

  useEffect(() => {
    void fetchPage(null, false)
  }, [fetchPage])

  const handleLoadMore = () => {
    if (!nextBefore) return
    setLoadingMore(true)
    void fetchPage(nextBefore, true)
  }

  const formatWhen = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Audit Log</CardTitle>
        </CardHeader>
        <p className="mb-4 text-xs text-gray-500">
          An append-only record of security-relevant actions — role changes, API keys,
          integrations, webhooks, exports, and recycle-bin purges.
        </p>

        {loading ? (
          <p className="text-sm text-gray-500">Loading audit log...</p>
        ) : error ? (
          <p className="text-sm text-fail-text">{error}</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-gray-500">No audit events yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                    <th className="pb-2 pr-4">When</th>
                    <th className="pb-2 pr-4">Who</th>
                    <th className="pb-2 pr-4">Action</th>
                    <th className="pb-2">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b border-gray-50 align-top last:border-0">
                      <td className="whitespace-nowrap py-2.5 pr-4 text-gray-500" suppressHydrationWarning>
                        {formatWhen(e.created_at)}
                      </td>
                      <td className="py-2.5 pr-4 font-medium text-gray-900">{actorLabel(e)}</td>
                      <td className="whitespace-nowrap py-2.5 pr-4">
                        <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">
                          {ACTION_LABELS[e.action] ?? e.action}
                        </span>
                      </td>
                      <td className="py-2.5 text-xs text-gray-500">
                        {e.target_type ? <span className="text-gray-600">{e.target_type}</span> : null}
                        {metaSummary(e.metadata) ? (
                          <span className="ml-1 font-mono text-gray-400">{metaSummary(e.metadata)}</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {nextBefore && (
              <div className="mt-3">
                <Button variant="secondary" size="sm" onClick={handleLoadMore} disabled={loadingMore}>
                  {loadingMore ? "Loading..." : "Load more"}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
