import { useCallback, useState } from "react"
import type { GetServerSideProps } from "next"
import { useRouter } from "next/router"
import { auth } from "@/auth"
import { AppLayout } from "@/components/layout/app-layout"
import { useUserRole } from "@/hooks/useUserRole"
import { Button } from "@/components/ui"
import { StatusBadge, type TestStatus } from "@/components/ui"
import { SegmentedBar } from "@/components/runs/SegmentedBar"
import { useRunSSE } from "@/hooks/useRunSSE"
import { DefectBadge } from "@/components/runs/DefectBadge"
import type { RunListItem } from "@/components/runs/RunCard"

// ── Types ─────────────────────────────────────────────────────────────────────

interface RunItem {
  id: string
  test_case_id: string
  case_title: string | null
  status: string
  comment: string | null
  executed_by: string | null
  executed_at: string | null
  created_at: string
  defect_id: string | null
  defect_title: string | null
  defect_external_id: string | null
  defect_external_url: string | null
  defect_external_status: string | null
}

interface RunDetail extends RunListItem {
  items: RunItem[]
}

interface RunDetailPageProps {
  slug: string
  projectKey: string
  workspaceId: string
  runId: string
  run: RunDetail | null
  apiUrl: string
  sseToken: string | null
}

// ── Status config ─────────────────────────────────────────────────────────────

const RUN_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-primary/10 text-primary border-primary/20" },
  completed: { label: "Completed", className: "bg-pass-bg text-pass-text border-pass/20" },
  aborted: { label: "Aborted", className: "bg-gray-100 text-gray-500 border-gray-200" },
}

const ITEM_STATUS_MAP: Record<string, TestStatus> = {
  pass: "pass",
  fail: "fail",
  blocked: "blocked",
  skipped: "skipped",
  untested: "untested",
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleString()
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RunDetailPage({
  slug,
  projectKey,
  workspaceId,
  runId,
  run: initialRun,
  apiUrl,
  sseToken,
}: RunDetailPageProps) {
  const router = useRouter()
  const { isAdmin } = useUserRole()
  const [run, setRun] = useState<RunDetail | null>(initialRun)
  const [items, setItems] = useState<RunItem[]>(initialRun?.items ?? [])
  const [isAborting, setIsAborting] = useState(false)
  const [confirmAbort, setConfirmAbort] = useState(false)
  const [isRerunning, setIsRerunning] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isDeleteRunning, setIsDeleteRunning] = useState(false)


  // Update defect status in local items state when Linear sync event arrives
  const handleDefectStatusUpdate = useCallback((runItemId: string, externalStatus: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === runItemId ? { ...item, defect_external_status: externalStatus } : item
      )
    )
  }, [])

  // Subscribe to SSE for live updates
  const liveStatsMap = useRunSSE(
    run ? [runId] : [],
    apiUrl,
    sseToken,
    workspaceId,
    { onDefectStatusUpdate: handleDefectStatusUpdate }
  )

  const liveStats = liveStatsMap.get(runId)

  const stats = liveStats ?? {
    pass: run?.pass_count ?? 0,
    fail: run?.fail_count ?? 0,
    blocked: run?.blocked_count ?? 0,
    skipped: run?.skipped_count ?? 0,
    untested: run?.untested_count ?? 0,
    total: run?.total_items ?? 0,
  }

  // Update item status when SSE event arrives with updatedItem
  // (liveStats change triggers re-render; items update from SSE via effect would need
  // additional message parsing — kept simple: full stats update only)

  const passRate = stats.total > 0
    ? Math.round((stats.pass / stats.total) * 100)
    : 0

  const completed = stats.total - stats.untested

  const handleAbort = async () => {
    if (!run) return

    setIsAborting(true)
    try {
      const res = await fetch(
        `/api/backend/workspaces/${workspaceId}/runs/${runId}/abort`,
        { method: "PATCH" }
      )
      if (res.ok) {
        setRun((prev) => prev ? { ...prev, status: "aborted" } : prev)
      } else {
        // Run may have been completed/aborted by another action — refresh state
        const detailRes = await fetch(`/api/backend/workspaces/${workspaceId}/runs/${runId}`)
        if (detailRes.ok) {
          const data = await detailRes.json() as { run: RunDetail; items: RunItem[] }
          setRun({ ...data.run, items: data.items })
          setItems(data.items)
        }
      }
    } catch {
      // Ignore network errors
    } finally {
      setIsAborting(false)
      setConfirmAbort(false)
    }
  }

  const handleRerunFailures = async () => {
    if (!run) return
    setIsRerunning(true)
    try {
      const res = await fetch(
        `/api/backend/workspaces/${workspaceId}/runs/${runId}/rerun-failures`,
        { method: "POST" }
      )
      if (res.ok) {
        const data = await res.json() as { id: string }
        void router.push(`/app/${slug}/${projectKey}/runs/${data.id}`)
      }
    } catch {
      // Ignore
    } finally {
      setIsRerunning(false)
    }
  }

  const handleDeleteRun = async () => {
    setIsDeleteRunning(true)
    try {
      const res = await fetch(
        `/api/backend/workspaces/${workspaceId}/runs/${runId}`,
        { method: "DELETE" }
      )
      if (res.ok) {
        void router.push(`/app/${slug}/${projectKey}/runs`)
      }
    } catch {
      // Ignore
    } finally {
      setIsDeleteRunning(false)
      setConfirmDelete(false)
    }
  }

  if (!run) {
    return (
      <AppLayout slug={slug} projectKey={projectKey}>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <h2 className="text-base font-semibold text-gray-900">Run not found</h2>
            <p className="mt-1 text-sm text-gray-500">
              This run may have been deleted or you do not have access.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-4"
              onClick={() => void router.push(`/app/${slug}/${projectKey}/runs`)}
            >
              Back to Runs
            </Button>
          </div>
        </div>
      </AppLayout>
    )
  }

  const statusConfig = RUN_STATUS_CONFIG[run.status] ?? RUN_STATUS_CONFIG.aborted!
  const isActive = run.status === "active"
  const isCompleted = run.status === "completed"
  const hasFailures = (liveStats?.fail ?? run.fail_count) > 0

  return (
    <AppLayout slug={slug} projectKey={projectKey}>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 bg-white px-6 py-4">
          {/* Breadcrumb */}
          <nav className="mb-2 flex items-center gap-1.5 text-xs text-gray-400">
            <button
              type="button"
              onClick={() => void router.push(`/app/${slug}/${projectKey}/runs`)}
              className="hover:text-primary hover:underline"
            >
              Test Runs
            </button>
            <span>/</span>
            <span className="text-gray-600">{run.name}</span>
          </nav>

          <div className="flex flex-wrap items-start gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-semibold text-gray-900">{run.name}</h1>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusConfig.className}`}
                >
                  {statusConfig.label}
                </span>
              </div>
              {run.assigned_to_name && (
                <p className="mt-0.5 text-sm text-gray-500">
                  Assigned to {run.assigned_to_name}
                </p>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {isActive && (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() =>
                      void router.push(`/app/${slug}/${projectKey}/runs/${runId}/execute`)
                    }
                  >
                    Resume Execution
                  </Button>
                  {confirmAbort ? (
                    <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5">
                      <span className="text-xs text-gray-600">Abort this run?</span>
                      <button
                        type="button"
                        onClick={() => void handleAbort()}
                        disabled={isAborting}
                        className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
                      >
                        {isAborting ? "Aborting…" : "Confirm"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmAbort(false)}
                        disabled={isAborting}
                        className="rounded-md px-2.5 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setConfirmAbort(true)}
                    >
                      Abort Run
                    </Button>
                  )}
                </>
              )}
              {isCompleted && hasFailures && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleRerunFailures()}
                  disabled={isRerunning}
                >
                  {isRerunning ? "Creating…" : "Rerun Failures"}
                </Button>
              )}
              {isAdmin && !confirmAbort && (
                <>
                  {confirmDelete ? (
                    <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5">
                      <span className="text-xs text-gray-600">Delete this run permanently?</span>
                      <button
                        type="button"
                        onClick={() => void handleDeleteRun()}
                        disabled={isDeleteRunning}
                        className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
                      >
                        {isDeleteRunning ? "Deleting…" : "Confirm"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        disabled={isDeleteRunning}
                        className="rounded-md px-2.5 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setConfirmDelete(true)}
                    >
                      Delete Run
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Progress bar + stats */}
          <div className="mt-4 flex flex-col gap-2">
            <SegmentedBar
              pass={stats.pass}
              fail={stats.fail}
              blocked={stats.blocked}
              skipped={stats.skipped}
              untested={stats.untested}
              total={stats.total}
            />
            <div className="flex flex-wrap gap-6 text-sm">
              <span className="text-pass-text font-medium">{stats.pass} Pass</span>
              <span className="text-fail-text font-medium">{stats.fail} Fail</span>
              <span className="text-blocked-text font-medium">{stats.blocked} Blocked</span>
              <span className="text-skipped-text">{stats.skipped} Skipped</span>
              <span className="text-gray-400">{stats.untested} Untested</span>
              <span className="ml-auto text-gray-600">
                {passRate}% pass · {completed}/{stats.total} done
              </span>
            </div>
          </div>
        </div>

        {/* Items table */}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <p className="text-sm text-gray-500">No test items in this run</p>
            </div>
          ) : (
            <table className="w-full table-fixed">
              <colgroup>
                <col className="w-[35%]" />
                <col className="w-[10%]" />
                <col className="w-[15%]" />
                <col className="w-[15%]" />
                <col className="w-[25%]" />
              </colgroup>
              <thead className="sticky top-0 bg-white shadow-sm">
                <tr className="border-b border-gray-200">
                  <th className="py-2 pl-6 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Test Case
                  </th>
                  <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Status
                  </th>
                  <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Executed At
                  </th>
                  <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Defect
                  </th>
                  <th className="py-2 pr-6 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const itemStatus = ITEM_STATUS_MAP[item.status] ?? "untested"
                  const hasDefect = !!item.defect_id
                  const hasComment = !!item.comment

                  return (
                    <tr
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => void router.push(`/app/${slug}/${projectKey}/runs/${runId}/execute?item=${idx}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") void router.push(`/app/${slug}/${projectKey}/runs/${runId}/execute?item=${idx}`)
                      }}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                    >
                      {/* Case title */}
                      <td className="py-3 pl-6 pr-4">
                        <span className="text-sm text-gray-900">
                          {item.case_title ?? "(untitled)"}
                        </span>
                      </td>

                      {/* Status badge */}
                      <td className="py-3 pr-4">
                        <StatusBadge status={itemStatus} />
                      </td>

                      {/* Executed at */}
                      <td className="py-3 pr-4 text-xs text-gray-400" suppressHydrationWarning>
                        {formatDate(item.executed_at)}
                      </td>

                      {/* Defect */}
                      <td className="py-3 pr-4">
                        {hasDefect && (
                          <div className="flex items-center gap-1.5 min-w-0" onClick={(e) => e.stopPropagation()}>
                            <DefectBadge
                              externalUrl={item.defect_external_url}
                              externalStatus={item.defect_external_status}
                              externalId={item.defect_external_id}
                            />
                          </div>
                        )}
                      </td>

                      {/* Notes */}
                      <td className="py-3 pr-6">
                        {hasComment && (
                          <p className="text-xs text-gray-500 truncate" title={item.comment ?? ""}>
                            {item.comment}
                          </p>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppLayout>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await auth(context)
  if (!session) return { redirect: { destination: "/login", permanent: false } }

  const { slug, projectKey, runId } = context.params as {
    slug: string
    projectKey: string
    runId: string
  }
  const workspaceId = session.user.workspace_id ?? ""
  const apiUrl = process.env.API_URL ?? ""

  const token =
    context.req.cookies["__Secure-authjs.session-token"] ??
    context.req.cookies["authjs.session-token"] ??
    null

  let run: RunDetail | null = null

  if (workspaceId && token) {
    try {
      const res = await fetch(
        `${apiUrl}/api/workspaces/${workspaceId}/runs/${runId}`,
        { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000) }
      )
      if (res.ok) {
        const data = await res.json() as { run: RunListItem; items: RunItem[] }
        run = { ...data.run, items: data.items }
      }
    } catch {
      // run stays null — 404 state handled in component
    }
  }

  return {
    props: {
      slug,
      projectKey,
      workspaceId,
      runId,
      run,
      // Browser-facing base URL for EventSource (SSE bypasses the /api/backend
      // gateway). Falls back to API_URL when both resolve to the same public host.
      apiUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? apiUrl,
      sseToken: token,
    },
  }
}
