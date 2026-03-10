import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Card, CardHeader, CardTitle } from "@/components/ui"
import { clsx } from "clsx"

export interface IngestionRun {
  id: string
  format: "junit" | "allure"
  status: "success" | "parse_error" | "partial"
  total_tests: number
  matched_tests: number
  unmatched_count: number
  run_id: string | null
  created_at: string
}

interface IngestionHistoryProps {
  workspaceId: string
  projectId: string
  slug: string
  projectKey: string
}

const STATUS_CONFIG: Record<
  IngestionRun["status"],
  { label: string; className: string }
> = {
  success: {
    label: "Success",
    className: "bg-pass-bg text-pass-text border-pass/20",
  },
  parse_error: {
    label: "Parse error",
    className: "bg-fail-bg text-fail-text border-fail/20",
  },
  partial: {
    label: "Partial",
    className: "bg-blocked-bg text-blocked-text border-blocked/20",
  },
}

function IngestionStatusBadge({ status }: { status: IngestionRun["status"] }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        cfg.className
      )}
    >
      {cfg.label}
    </span>
  )
}

export function IngestionHistory({
  workspaceId,
  projectId,
  slug,
  projectKey,
}: IngestionHistoryProps) {
  const [runs, setRuns] = useState<IngestionRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRuns = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/backend/workspaces/${workspaceId}/projects/${projectId}/ingestion-runs`
      )
      if (!res.ok) throw new Error(`Failed to load ingestion history (${res.status})`)
      const data = await res.json() as IngestionRun[]
      setRuns(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ingestion history")
    } finally {
      setLoading(false)
    }
  }, [workspaceId, projectId])

  useEffect(() => {
    void fetchRuns()
  }, [fetchRuns])

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ingestion History</CardTitle>
      </CardHeader>

      {loading ? (
        <p className="text-sm text-gray-500">Loading ingestion history...</p>
      ) : error ? (
        <p className="text-sm text-fail">{error}</p>
      ) : runs.length === 0 ? (
        <p className="text-sm text-gray-500">
          No CI results yet. Set up your pipeline using the guide above.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="pb-2 pr-4">Timestamp</th>
                <th className="pb-2 pr-4">Format</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4 text-right">Total</th>
                <th className="pb-2 pr-4 text-right">Matched</th>
                <th className="pb-2 pr-4 text-right">Unmatched</th>
                <th className="pb-2">Run</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2.5 pr-4 text-gray-500 whitespace-nowrap">
                    {formatDate(run.created_at)}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600">
                      {run.format === "junit" ? "JUnit XML" : "Allure JSON"}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4">
                    <IngestionStatusBadge status={run.status} />
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-gray-700">
                    {run.total_tests}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-gray-700">
                    {run.matched_tests}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-gray-700">
                    {run.unmatched_count}
                  </td>
                  <td className="py-2.5">
                    {run.run_id ? (
                      <Link
                        href={`/app/${slug}/${projectKey}/runs/${run.run_id}`}
                        className="text-cobalt underline hover:text-cobalt-dark text-xs"
                      >
                        View run
                      </Link>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
