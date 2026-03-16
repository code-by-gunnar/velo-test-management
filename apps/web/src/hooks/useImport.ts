import { useState, useCallback } from "react"
import Papa from "papaparse"

// Represents a parsed row for preview (headers → values)
export type ParsedRow = Record<string, string>

export interface ColumnMapping {
  title: string       // header name mapped to "title" field
  action: string      // header name mapped to "action" field
  expected: string    // header name mapped to "expected" field
  preconditions?: string
  priority?: string
  suite?: string
  keyword?: string    // GWT keyword column (given/when/then/and/but)
}

type ImportStatus = "idle" | "file-selected" | "previewing" | "importing" | "done" | "error"

export interface ImportState {
  status: ImportStatus
  file: File | null
  headers: string[]
  preview: ParsedRow[]
  totalRows: number
  columnMapping: ColumnMapping
  error: string | null
  importedCount: number
}

const EMPTY_MAPPING: ColumnMapping = {
  title: "",
  action: "",
  expected: "",
}

// Detect column names from header list (case-insensitive, same logic as server)
function detectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = { title: "", action: "", expected: "" }
  for (const h of headers) {
    const lower = h.toLowerCase().trim()
    if (["title", "test case", "name", "test name"].includes(lower)) mapping.title = h
    if (["action", "step", "step description", "description"].includes(lower)) mapping.action = h
    if (["expected", "expected result", "expected results"].includes(lower)) mapping.expected = h
    if (["preconditions", "precondition", "prerequisites"].includes(lower))
      mapping.preconditions = h
    if (["priority", "severity"].includes(lower)) mapping.priority = h
    if (["suite", "area", "module", "section", "folder", "group"].includes(lower)) mapping.suite = h
    if (["keyword", "step type", "step_type", "gwt", "type"].includes(lower)) mapping.keyword = h
  }
  return mapping
}

interface UseImportOptions {
  workspaceId: string
  projectId: string
  onSuccess?: (count: number) => void
}

export function useImport({ workspaceId, projectId, onSuccess }: UseImportOptions) {
  const [state, setState] = useState<ImportState>({
    status: "idle",
    file: null,
    headers: [],
    preview: [],
    totalRows: 0,
    columnMapping: EMPTY_MAPPING,
    error: null,
    importedCount: 0,
  })

  const selectFile = useCallback((file: File) => {
    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: "File exceeds 5MB limit. Please upload a smaller file.",
      }))
      return
    }

    setState((prev) => ({ ...prev, status: "file-selected", file, error: null }))

    // Client-side preview using papaparse (10 rows for display)
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      preview: 10,
      complete: (result) => {
        const headers = result.meta.fields ?? []
        const mapping = detectColumnMapping(headers)
        const previewData = result.data

        // Count total rows (separate quick parse without preview limit)
        Papa.parse<Record<string, string>>(file, {
          header: true,
          skipEmptyLines: true,
          complete: (fullResult) => {
            setState((prev) => ({
              ...prev,
              status: "previewing",
              headers,
              preview: previewData,
              totalRows: fullResult.data.length,
              columnMapping: mapping,
            }))
          },
          error: () => {
            // Fallback to preview count
            setState((prev) => ({
              ...prev,
              status: "previewing",
              headers,
              preview: previewData,
              totalRows: previewData.length,
              columnMapping: mapping,
            }))
          },
        })
      },
      error: (err) => {
        setState((prev) => ({
          ...prev,
          status: "error",
          error: `Could not parse CSV: ${err.message}`,
        }))
      },
    })
  }, [])

  const setColumnMapping = useCallback((mapping: ColumnMapping) => {
    setState((prev) => ({ ...prev, columnMapping: mapping }))
  }, [])

  const runImport = useCallback(async () => {
    const { file } = state
    if (!file) return

    setState((prev) => ({ ...prev, status: "importing", error: null }))

    const formData = new FormData()
    formData.append("file", file)

    // Forward the user's column mapping so the server uses it instead of auto-detecting
    const { columnMapping } = state
    const params = new URLSearchParams()
    if (columnMapping.title) params.set("colTitle", columnMapping.title)
    if (columnMapping.action) params.set("colAction", columnMapping.action)
    if (columnMapping.expected) params.set("colExpected", columnMapping.expected)
    if (columnMapping.preconditions) params.set("colPreconditions", columnMapping.preconditions)
    if (columnMapping.priority) params.set("colPriority", columnMapping.priority)
    if (columnMapping.suite) params.set("colSuite", columnMapping.suite)
    if (columnMapping.keyword) params.set("colKeyword", columnMapping.keyword)

    try {
      const res = await fetch(
        `/api/backend/workspaces/${workspaceId}/projects/${projectId}/cases/import?${params.toString()}`,
        {
          method: "POST",
          body: formData,
          // No Content-Type header — browser sets multipart boundary automatically
        }
      )

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Server error: ${res.status}`)
      }

      const body = (await res.json()) as { imported: number }
      setState((prev) => ({
        ...prev,
        status: "done",
        importedCount: body.imported,
      }))
      onSuccess?.(body.imported)
    } catch (err: unknown) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: err instanceof Error ? err.message : "Import failed",
      }))
    }
  }, [state, workspaceId, projectId, onSuccess])

  const reset = useCallback(() => {
    setState({
      status: "idle",
      file: null,
      headers: [],
      preview: [],
      totalRows: 0,
      columnMapping: EMPTY_MAPPING,
      error: null,
      importedCount: 0,
    })
  }, [])

  return { state, selectFile, setColumnMapping, runImport, reset }
}
