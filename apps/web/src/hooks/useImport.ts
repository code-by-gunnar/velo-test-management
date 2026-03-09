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
}

type ImportStatus = "idle" | "file-selected" | "previewing" | "importing" | "done" | "error"

export interface ImportState {
  status: ImportStatus
  file: File | null
  headers: string[]
  preview: ParsedRow[]
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

    // Client-side preview using papaparse (CSV only for preview; XLSX goes directly to server)
    const ext = file.name.toLowerCase()
    if (ext.endsWith(".csv")) {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        preview: 10,
        complete: (result) => {
          const headers = result.meta.fields ?? []
          const mapping = detectColumnMapping(headers)
          setState((prev) => ({
            ...prev,
            status: "previewing",
            headers,
            preview: result.data,
            columnMapping: mapping,
          }))
        },
        error: (err) => {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: `Could not parse CSV: ${err.message}`,
          }))
        },
      })
    } else {
      // XLSX: no client-side preview available — show file name, go straight to mapping step
      setState((prev) => ({
        ...prev,
        status: "previewing",
        headers: [],
        preview: [],
        columnMapping: EMPTY_MAPPING,
      }))
    }
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
      columnMapping: EMPTY_MAPPING,
      error: null,
      importedCount: 0,
    })
  }, [])

  return { state, selectFile, setColumnMapping, runImport, reset }
}
