import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui"
import { Trash2, Clock, X } from "lucide-react"

interface LifecycleStatus {
  deletion_status: string | null
  deletion_requested_at: string | null
  deletion_scheduled_at: string | null
  deletion_requested_by: string | null
}

interface DeletionPanelProps {
  workspaceId: string
  userRole: string | null
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

function daysRemaining(scheduledAt: string): number {
  const now = new Date()
  const scheduled = new Date(scheduledAt)
  const diff = scheduled.getTime() - now.getTime()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

export function DeletionPanel({ workspaceId, userRole }: DeletionPanelProps) {
  const isAdmin = userRole === "admin"

  const [status, setStatus] = useState<LifecycleStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/backend/workspaces/${workspaceId}/lifecycle/status`
      )
      if (!res.ok) throw new Error(`Failed to load deletion status (${res.status})`)
      const data = (await res.json()) as LifecycleStatus
      setStatus(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deletion status")
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void fetchStatus()
  }, [fetchStatus])

  const handleRequestDeletion = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/backend/workspaces/${workspaceId}/lifecycle/request-deletion`,
        { method: "POST" }
      )
      if (!res.ok) {
        const body = (await res.json()) as { message?: string }
        throw new Error(body.message ?? `Failed to request deletion (${res.status})`)
      }
      setConfirming(false)
      void fetchStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to request deletion")
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancelDeletion = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/backend/workspaces/${workspaceId}/lifecycle/cancel-deletion`,
        { method: "POST" }
      )
      if (!res.ok) {
        const body = (await res.json()) as { message?: string }
        throw new Error(body.message ?? `Failed to cancel deletion (${res.status})`)
      }
      void fetchStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel deletion")
    } finally {
      setSubmitting(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <p className="text-sm text-gray-500">
          Only workspace admins can manage deletion settings.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    )
  }

  if (error && !status) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <p className="text-sm text-fail-text">{error}</p>
      </div>
    )
  }

  const isPending = status?.deletion_status === "pending_deletion"

  return (
    <div className="flex flex-col gap-4">
      {isPending && status.deletion_scheduled_at ? (
        /* Pending deletion state */
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gray-900">
                Workspace scheduled for deletion
              </h3>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-gray-500">Scheduled date</dt>
                <dd className="text-gray-900">
                  {formatDate(status.deletion_scheduled_at)}
                </dd>
                <dt className="text-gray-500">Time remaining</dt>
                <dd className="text-gray-900">
                  {daysRemaining(status.deletion_scheduled_at)} days remaining
                </dd>
                {status.deletion_requested_at && (
                  <>
                    <dt className="text-gray-500">Requested</dt>
                    <dd className="text-gray-900">
                      {formatDate(status.deletion_requested_at)}
                    </dd>
                  </>
                )}
              </dl>

              {error && (
                <p className="mt-3 text-sm text-fail-text">{error}</p>
              )}

              <div className="mt-4">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleCancelDeletion()}
                  disabled={submitting}
                >
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  {submitting ? "Cancelling..." : "Cancel deletion"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* No pending deletion */
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gray-900">
                Delete this workspace
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Permanently removes all workspace data including test cases,
                runs, and results. This action has a 30-day grace period during
                which it can be cancelled.
              </p>

              {error && (
                <p className="mt-3 text-sm text-fail-text">{error}</p>
              )}

              {confirming ? (
                <div className="mt-4">
                  <p className="mb-3 text-sm text-gray-600">
                    Are you sure? This will schedule deletion in 30 days.
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => void handleRequestDeletion()}
                      disabled={submitting}
                    >
                      {submitting ? "Requesting..." : "Confirm deletion"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setConfirming(false)}
                      disabled={submitting}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirming(true)}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Delete workspace
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
