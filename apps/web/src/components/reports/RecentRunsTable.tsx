import Link from "next/link"
import { StatusBadge } from "@/components/ui/status-badge"
import type { TestStatus } from "@/components/ui/status-badge"

interface RecentRun {
  id: string
  name: string
  status: string
  created_at: string
  total: number
  pass: number
  fail: number
  blocked: number
  skipped: number
}

interface RecentRunsTableProps {
  data: RecentRun[]
  slug: string
  projectKey: string
}

const VALID_STATUSES = new Set(["pass", "fail", "blocked", "skipped", "untested"])

function toRunStatus(s: string): TestStatus {
  // Map run status to badge status
  if (s === "completed") return "pass"
  if (s === "aborted") return "fail"
  return "untested" // active
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

export function RecentRunsTable({ data, slug, projectKey }: RecentRunsTableProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-gray-400">
        No test runs yet. Create a test run to get started.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Run</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Status</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Pass Rate</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Results</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500" suppressHydrationWarning>Date</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => {
            const passRate = r.total > 0 ? Math.round((r.pass / r.total) * 100) : 0

            return (
              <tr key={r.id} className="border-b border-gray-50 last:border-0">
                <td className="px-4 py-3">
                  <Link
                    href={`/app/${slug}/${projectKey}/runs/${r.id}`}
                    className="text-sm font-medium text-gray-900 hover:text-primary transition-colors"
                  >
                    {r.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize"
                    style={{
                      borderColor: r.status === "completed" ? "rgba(61,153,112,0.3)" : r.status === "aborted" ? "rgba(192,57,43,0.3)" : "rgba(45,127,249,0.3)",
                      backgroundColor: r.status === "completed" ? "rgba(61,153,112,0.08)" : r.status === "aborted" ? "rgba(192,57,43,0.08)" : "rgba(45,127,249,0.08)",
                      color: r.status === "completed" ? "#1B5E42" : r.status === "aborted" ? "#7B241C" : "#5B5BD6",
                    }}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-pass"
                        style={{ width: `${passRate}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-600 tabular-nums">{passRate}%</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="text-pass-text font-medium">{r.pass}P</span>
                    <span className="text-fail-text font-medium">{r.fail}F</span>
                    <span className="text-blocked-text font-medium">{r.blocked}B</span>
                    <span className="text-skipped-text font-medium">{r.skipped}S</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-xs text-gray-400" suppressHydrationWarning>
                  {formatDate(r.created_at)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
