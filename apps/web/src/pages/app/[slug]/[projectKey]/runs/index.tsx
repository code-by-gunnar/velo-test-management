import { useState, useCallback, useRef } from "react"
import type { GetServerSideProps } from "next"
import { useRouter } from "next/router"
import { auth } from "@/auth"
import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui"
import { RunCard, type RunListItem } from "@/components/runs/RunCard"
import { RunFilters, type FilterState } from "@/components/runs/RunFilters"
import { RunCreateModal } from "@/components/runs/RunCreateModal"
import { useRunSSE } from "@/hooks/useRunSSE"
import { useUserRole } from "@/hooks/useUserRole"
import { Play } from "lucide-react"

interface RunsDashboardProps {
  slug: string
  projectKey: string
  workspaceId: string
  projectId: string
  initialRuns: RunListItem[]
  apiUrl: string
  sseToken: string | null
}

export default function RunsDashboard({
  slug,
  projectKey,
  workspaceId,
  projectId,
  initialRuns,
  apiUrl,
  sseToken,
}: RunsDashboardProps) {
  const router = useRouter()
  const { canEdit } = useUserRole()

  const [runs, setRuns] = useState<RunListItem[]>(initialRuns)
  const [filters, setFilters] = useState<FilterState>({})
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isFiltering, setIsFiltering] = useState(false)

  // Subscribe to SSE for all active runs
  const activeRunIds = runs
    .filter((r) => r.status === "active")
    .map((r) => r.id)

  const liveStatsMap = useRunSSE(activeRunIds, apiUrl, sseToken, workspaceId)

  const abortRef = useRef<AbortController | null>(null)

  const fetchRuns = useCallback(async (f: FilterState) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsFiltering(true)
    try {
      const params = new URLSearchParams({ project_id: projectId })
      if (f.status) params.set("status", f.status)
      if (f.assigned_to) params.set("assigned_to", f.assigned_to)

      const res = await fetch(
        `/api/backend/workspaces/${workspaceId}/runs?${params.toString()}`,
        { signal: controller.signal }
      )
      if (res.ok) {
        const data = await res.json() as RunListItem[]
        setRuns(data)
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
    } finally {
      if (!controller.signal.aborted) setIsFiltering(false)
    }
  }, [workspaceId, projectId])

  const handleFilterChange = (f: FilterState) => {
    setFilters(f)
    void fetchRuns(f)
  }

  const handleRunCreated = (newRun: RunListItem) => {
    setRuns((prev) => [newRun, ...prev])
  }

  const handleCardClick = (runId: string) => {
    void router.push(`/app/${slug}/${projectKey}/runs/${runId}`)
  }

  // Group: active at top, completed/aborted below (each group by created_at DESC)
  const activeRuns = runs.filter((r) => r.status === "active")
  const inactiveRuns = runs.filter((r) => r.status !== "active")

  return (
    <AppLayout slug={slug} projectKey={projectKey}>
      <div className="flex h-full flex-col">
        {/* Page header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-gray-900">Test Runs</h1>
            {!isFiltering && (
              <span className="text-sm text-gray-400">
                {runs.length} {runs.length === 1 ? "run" : "runs"}
              </span>
            )}
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsModalOpen(true)}
            disabled={!canEdit}
          >
            New Run
          </Button>
        </div>

        {/* Filters */}
        <div className="border-b border-gray-100 bg-white px-6 py-3">
          <RunFilters
            filters={filters}
            onChange={handleFilterChange}
            assignees={[]}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {runs.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                <Play size={28} className="text-gray-300" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">No test runs yet</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Create your first test run to start tracking execution
                </p>
              </div>
              <Button variant="primary" size="md" onClick={() => setIsModalOpen(true)} disabled={!canEdit}>
                Create your first test run
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {/* Active runs */}
              {activeRuns.length > 0 && (
                <section>
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Active
                  </h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {activeRuns.map((run) => (
                      <RunCard
                        key={run.id}
                        run={run}
                        onClick={handleCardClick}
                        {...(liveStatsMap.get(run.id) !== undefined
                          ? { liveStats: liveStatsMap.get(run.id)! }
                          : {})}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Completed / aborted runs */}
              {inactiveRuns.length > 0 && (
                <section>
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Completed / Aborted
                  </h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {inactiveRuns.map((run) => (
                      <RunCard
                        key={run.id}
                        run={run}
                        onClick={handleCardClick}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>

      {canEdit && (
        <RunCreateModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onCreated={handleRunCreated}
          workspaceId={workspaceId}
          projectId={projectId}
          assignees={[]}
        />
      )}
    </AppLayout>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await auth(context)
  if (!session) return { redirect: { destination: "/login", permanent: false } }

  const { slug, projectKey } = context.params as { slug: string; projectKey: string }
  const workspaceId = session.user.workspace_id ?? ""
  const apiUrl = process.env.API_URL ?? ""

  const token =
    context.req.cookies["__Secure-authjs.session-token"] ??
    context.req.cookies["authjs.session-token"] ??
    null

  let projectId = ""
  let initialRuns: RunListItem[] = []

  if (workspaceId && token) {
    try {
      // Resolve projectKey → UUID via single-row lookup
      const projectRes = await fetch(
        `${apiUrl}/api/workspaces/${workspaceId}/projects/by-key/${projectKey}`,
        { headers: { authorization: `Bearer ${token}` } }
      )
      if (projectRes.ok) {
        const project = await projectRes.json() as { id: string }
        projectId = project.id
      }
    } catch {
      // projectId stays empty
    }

    if (projectId) {
      try {
        const runsRes = await fetch(
          `${apiUrl}/api/workspaces/${workspaceId}/runs?project_id=${projectId}`,
          { headers: { authorization: `Bearer ${token}` } }
        )
        if (runsRes.ok) {
          initialRuns = await runsRes.json() as RunListItem[]
        }
      } catch {
        // initialRuns stays empty — page still renders with empty state
      }
    }
  }

  return {
    props: {
      slug,
      projectKey,
      workspaceId,
      projectId,
      initialRuns,
      apiUrl,
      sseToken: token,
    },
  }
}
