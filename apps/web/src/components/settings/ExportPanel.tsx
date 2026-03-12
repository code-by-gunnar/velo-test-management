import { useState } from "react"
import { Button } from "@/components/ui"
import { Download } from "lucide-react"

interface ExportPanelProps {
  workspaceId: string
}

export function ExportPanel({ workspaceId }: ExportPanelProps) {
  const [format, setFormat] = useState<"json" | "csv">("json")
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleExport = async () => {
    setExporting(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/backend/workspaces/${workspaceId}/export?format=${format}`
      )
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Export failed (${res.status})`)
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `velo-export-${workspaceId.slice(0, 8)}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <Download className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900">Export workspace data</h3>
          <p className="mt-1 text-sm text-gray-500">
            Download all test cases, suites, runs, and results as a ZIP file.
          </p>

          <div className="mt-3 flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm text-gray-700">
              <input
                type="radio"
                name="export-format"
                value="json"
                checked={format === "json"}
                onChange={() => setFormat("json")}
                className="text-primary focus:ring-primary"
              />
              JSON
            </label>
            <label className="flex items-center gap-1.5 text-sm text-gray-700">
              <input
                type="radio"
                name="export-format"
                value="csv"
                checked={format === "csv"}
                onChange={() => setFormat("csv")}
                className="text-primary focus:ring-primary"
              />
              CSV
            </label>
          </div>

          {error && (
            <p className="mt-3 text-sm text-fail-text">{error}</p>
          )}

          <div className="mt-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleExport()}
              disabled={exporting}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {exporting ? "Exporting..." : "Export data"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
