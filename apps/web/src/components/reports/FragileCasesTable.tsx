interface FragileCase {
  case_id: string
  case_title: string
  suite_name: string | null
  fail_count: number
  total_executions: number
  fail_rate: number
  last_failed_at: string | null
}

interface FragileCasesTableProps {
  data: FragileCase[]
  slug: string
  projectKey: string
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

export function FragileCasesTable({ data, slug, projectKey }: FragileCasesTableProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-gray-400">
        No test failures in the last 30 days.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Test Case</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Suite</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Failures</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Fail Rate</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500" suppressHydrationWarning>Last Failed</th>
          </tr>
        </thead>
        <tbody>
          {data.map((c) => (
            <tr key={c.case_id} className="border-b border-gray-50 last:border-0">
              <td className="px-4 py-3">
                <a
                  href={`/app/${slug}/${projectKey}/cases`}
                  className="text-sm text-gray-900 hover:text-primary transition-colors"
                >
                  {c.case_title}
                </a>
              </td>
              <td className="px-4 py-3 text-gray-500">
                {c.suite_name ?? <span className="text-gray-300">—</span>}
              </td>
              <td className="px-4 py-3 text-right">
                <span className="inline-flex items-center rounded-full bg-fail-bg px-2 py-0.5 text-xs font-medium text-fail-text">
                  {c.fail_count}
                </span>
              </td>
              <td className="px-4 py-3 text-right text-gray-600">
                {c.fail_rate}%
              </td>
              <td className="px-4 py-3 text-right text-xs text-gray-400" suppressHydrationWarning>
                {formatDate(c.last_failed_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
