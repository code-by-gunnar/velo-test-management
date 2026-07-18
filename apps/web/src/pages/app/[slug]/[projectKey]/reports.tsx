import { useState, useEffect } from "react"
import type { GetServerSideProps } from "next"
import { auth } from "@/auth"
import { resolveProject } from "@/lib/project-cache"
import { useCachedState } from "@/hooks/useCachedState"
import { AppLayout } from "@/components/layout/app-layout"
import { RunTrendChart } from "@/components/reports/RunTrendChart"
import { FragileCasesTable } from "@/components/reports/FragileCasesTable"
import { RecentRunsTable } from "@/components/reports/RecentRunsTable"
import { TrendingDown, AlertTriangle, BarChart3 } from "lucide-react"

interface ReportsPageProps {
  slug: string
  projectKey: string
  workspaceId: string
  projectId: string
}

interface ReportData {
  run_trend: Array<{
    run_id: string
    run_name: string
    completed_at: string
    total: number
    pass: number
    fail: number
    blocked: number
    skipped: number
    pass_rate: number
  }>
  fragile_cases: Array<{
    case_id: string
    case_title: string
    suite_name: string | null
    fail_count: number
    total_executions: number
    fail_rate: number
    last_failed_at: string | null
  }>
  recent_runs: Array<{
    id: string
    name: string
    status: string
    created_at: string
    total: number
    pass: number
    fail: number
    blocked: number
    skipped: number
  }>
}

export default function ReportsPage({ slug, projectKey, workspaceId, projectId }: ReportsPageProps) {
  // Cached report renders instantly on revisit; the fetch refreshes it in the
  // background. A failed refresh keeps showing the cached data.
  const [data, setData, hadCache] = useCachedState<ReportData | null>(
    `velo:reports:${workspaceId}:${projectId}`,
    null
  )
  const [loading, setLoading] = useState(!hadCache)

  useEffect(() => {
    fetch(`/api/backend/workspaces/${workspaceId}/projects/${projectId}/reports`)
      .then((res) => (res.ok ? (res.json() as Promise<ReportData>) : null))
      .then((d) => {
        if (d) setData(d)
      })
      .catch(() => {
        // Keep cached data on transient failure
      })
      .finally(() => setLoading(false))
  }, [workspaceId, projectId, setData])

  return (
    <AppLayout slug={slug} projectKey={projectKey}>
      <div className="flex h-full flex-col">
        <div className="border-b border-gray-200 bg-white px-6 py-4">
          <h1 className="text-lg font-semibold text-gray-900 font-display">Reports</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Test health and quality metrics
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-5xl space-y-6">
            {loading && (
              <div className="flex items-center justify-center py-20 text-sm text-gray-400">
                Loading reports…
              </div>
            )}

            {!loading && data && (
              <>
                {/* Section 1: Pass Rate Trend */}
                <div className="rounded-lg border border-gray-200 bg-white shadow-card overflow-hidden">
                  <div className="flex items-center gap-2 px-5 pt-5 pb-2">
                    <TrendingDown size={16} className="text-gray-400" />
                    <h2 className="text-sm font-semibold text-gray-900">Pass Rate Trend</h2>
                    <span className="text-xs text-gray-400 ml-1">Last {data.run_trend.length} completed runs</span>
                  </div>
                  <div className="px-5 pb-5">
                    <RunTrendChart data={data.run_trend} />
                  </div>
                </div>

                {/* Section 2: Fragile Areas */}
                <div className="rounded-lg border border-gray-200 bg-white shadow-card overflow-hidden">
                  <div className="flex items-center gap-2 px-5 pt-5 pb-2">
                    <AlertTriangle size={16} className="text-gray-400" />
                    <h2 className="text-sm font-semibold text-gray-900">Fragile Areas</h2>
                    <span className="text-xs text-gray-400 ml-1">Most failing test cases in last 30 days</span>
                  </div>
                  <FragileCasesTable data={data.fragile_cases} slug={slug} projectKey={projectKey} />
                </div>

                {/* Section 3: Recent Runs */}
                <div className="rounded-lg border border-gray-200 bg-white shadow-card overflow-hidden">
                  <div className="flex items-center gap-2 px-5 pt-5 pb-2">
                    <BarChart3 size={16} className="text-gray-400" />
                    <h2 className="text-sm font-semibold text-gray-900">Recent Runs</h2>
                  </div>
                  <RecentRunsTable data={data.recent_runs} slug={slug} projectKey={projectKey} />
                </div>
              </>
            )}

            {!loading && !data && (
              <div className="flex items-center justify-center py-20 text-sm text-gray-400">
                Could not load report data.
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await auth(context)
  if (!session) return { redirect: { destination: "/login", permanent: false } }

  const { slug, projectKey } = context.params as { slug: string; projectKey: string }
  const workspaceId = session.user.workspace_id ?? ""

  const token =
    context.req.cookies["__Secure-authjs.session-token"] ??
    context.req.cookies["authjs.session-token"]

  const project = await resolveProject(workspaceId, projectKey, token)

  return { props: { slug, projectKey, workspaceId, projectId: project?.id ?? "" } }
}
