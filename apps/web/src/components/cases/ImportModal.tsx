import { useRef, useEffect, useCallback, type DragEvent, type ChangeEvent } from "react"
import { useImport, type ColumnMapping } from "@/hooks/useImport"
import { Button } from "@/components/ui"

interface ImportModalProps {
  isOpen: boolean
  workspaceId: string
  projectId: string
  onClose: () => void
  onSuccess: () => void
}

// ── Step 1: File Picker ────────────────────────────────────────────────────────

interface FilePickerProps {
  onFile: (file: File) => void
  error: string | null
}

const SAMPLE_CSV_ROWS = [
  ["title", "suite", "action", "expected result", "priority"],
  ["User can log in", "Enter valid credentials and click Sign In", "Dashboard loads", "high"],
  ["User sees error on bad password", "Enter wrong password and click Sign In", "Error message displayed", "medium"],
  ["User can reset password", "Click Forgot Password and enter email", "Reset email sent confirmation", "medium"],
]

function downloadSampleCsv() {
  const csv = SAMPLE_CSV_ROWS.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "velo-sample-import.csv"
  a.click()
  URL.revokeObjectURL(url)
}

function FilePicker({ onFile, error }: FilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (file) onFile(file)
    },
    [onFile]
  )

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }, [])

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) onFile(file)
    },
    [onFile]
  )

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-gray-300 px-6 py-12 text-center transition hover:border-primary hover:bg-primary/5"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click()
        }}
        aria-label="Upload file"
      >
        <div className="text-4xl text-gray-300">&#8679;</div>
        <div>
          <p className="text-sm font-medium text-gray-700">
            Drop your CSV file here
          </p>
          <p className="mt-1 text-xs text-gray-400">or click to browse — Max 5MB</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleInputChange}
        />
      </div>

      <p className="text-center text-xs text-gray-400">
        Not sure about the format?{" "}
        <button
          type="button"
          onClick={downloadSampleCsv}
          className="text-primary underline hover:no-underline"
        >
          Download sample CSV
        </button>
      </p>

      {error && (
        <p className="rounded-md bg-fail-bg px-3 py-2 text-sm text-fail-text">{error}</p>
      )}
    </div>
  )
}

// ── Step 2: Column Mapping Preview ────────────────────────────────────────────

interface MappingStepProps {
  fileName: string
  headers: string[]
  preview: Record<string, string>[]
  columnMapping: ColumnMapping
  onMappingChange: (mapping: ColumnMapping) => void
  onBack: () => void
  onImport: () => void
  rowCount: number
}

function MappingStep({
  fileName,
  headers,
  preview,
  columnMapping,
  onMappingChange,
  onBack,
  onImport,
  rowCount,
}: MappingStepProps) {
  const canImport = columnMapping.title.length > 0 && columnMapping.action.length > 0

  const updateField =
    (field: keyof ColumnMapping) => (e: ChangeEvent<HTMLSelectElement>) => {
      onMappingChange({ ...columnMapping, [field]: e.target.value })
    }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-gray-500">
        File: <span className="font-medium text-gray-800">{fileName}</span>
        {rowCount > 0 && <span className="ml-2 text-gray-400">({rowCount} rows preview)</span>}
      </div>

      {/* Column mapping controls */}
      <div className="rounded-lg border border-gray-200 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Column Mapping
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Title — required */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">
              Title <span className="text-fail">*</span>
            </label>
            <select
              value={columnMapping.title}
              onChange={updateField("title")}
              className="rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-800 focus:border-primary focus:outline-none"
            >
              <option value="">-- select --</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          {/* Suite — optional */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">Suite / Area</label>
            <select
              value={columnMapping.suite ?? ""}
              onChange={updateField("suite")}
              className="rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-800 focus:border-primary focus:outline-none"
            >
              <option value="">-- (none) --</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          {/* Action — required */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">
              Action / Step <span className="text-fail">*</span>
            </label>
            <select
              value={columnMapping.action}
              onChange={updateField("action")}
              className="rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-800 focus:border-primary focus:outline-none"
            >
              <option value="">-- select --</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          {/* Expected — optional */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">Expected Result</label>
            <select
              value={columnMapping.expected}
              onChange={updateField("expected")}
              className="rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-800 focus:border-primary focus:outline-none"
            >
              <option value="">-- (none) --</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          {/* Keyword (GWT) — optional */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">Keyword (GWT)</label>
            <select
              value={columnMapping.keyword ?? ""}
              onChange={updateField("keyword")}
              className="rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-800 focus:border-primary focus:outline-none"
            >
              <option value="">-- (none) --</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!canImport && (
          <p className="mt-2 text-xs text-fail">
            Title and Action / Step columns are required
          </p>
        )}
      </div>

      {/* Preview table */}
      {preview.length > 0 && (
        <div className="overflow-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                {headers.map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap border-b border-gray-200 px-3 py-2 text-left font-semibold text-gray-600"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0">
                  {headers.map((h) => (
                    <td
                      key={h}
                      className="max-w-xs truncate px-3 py-1.5 text-gray-700"
                      title={row[h] ?? ""}
                    >
                      {row[h] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button variant="secondary" size="sm" onClick={onBack}>
          Back
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onImport}
          disabled={!canImport}
        >
          Import{rowCount > 0 ? ` ${rowCount} rows` : ""}
        </Button>
      </div>
    </div>
  )
}

// ── ImportModal ───────────────────────────────────────────────────────────────

export function ImportModal({
  isOpen,
  workspaceId,
  projectId,
  onClose,
  onSuccess,
}: ImportModalProps) {
  const { state, selectFile, setColumnMapping, runImport, reset } = useImport({
    workspaceId,
    projectId,
    onSuccess: () => {
      onSuccess()
    },
  })

  // Close on Esc key
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) reset()
  }, [isOpen, reset])

  if (!isOpen) return null

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleBack = () => {
    reset()
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      {/* Modal box */}
      <div className="relative w-full max-w-2xl rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Import Test Cases</h2>
          <button
            onClick={handleClose}
            className="rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            &#10005;
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* Step 1: File picker (idle, file-selected, or size error before a file is set) */}
          {(state.status === "idle" || state.status === "file-selected" ||
            (state.status === "error" && !state.file)) && (
            <FilePicker onFile={selectFile} error={state.error} />
          )}

          {/* Step 2: Column mapping + preview */}
          {state.status === "previewing" && state.file && (
            <MappingStep
              fileName={state.file.name}
              headers={state.headers}
              preview={state.preview}
              columnMapping={state.columnMapping}
              onMappingChange={setColumnMapping}
              onBack={handleBack}
              onImport={() => void runImport()}
              rowCount={state.preview.length}
            />
          )}

          {/* Step 3a: Importing spinner */}
          {state.status === "importing" && (
            <div className="flex flex-col items-center gap-4 py-10">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="text-sm text-gray-600">Importing test cases…</p>
            </div>
          )}

          {/* Step 3b: Done */}
          {state.status === "done" && (
            <div className="flex flex-col items-center gap-4 py-10">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-pass-bg text-2xl text-pass">
                ✓
              </div>
              <p className="text-base font-semibold text-gray-900">
                {state.importedCount} {state.importedCount === 1 ? "case" : "cases"} imported
              </p>
              <Button variant="primary" size="md" onClick={handleClose}>
                Close
              </Button>
            </div>
          )}

          {/* Step 3c: Error during import */}
          {state.status === "error" && state.file && (
            <div className="flex flex-col items-center gap-4 py-10">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-fail-bg text-2xl text-fail">
                &#10005;
              </div>
              <p className="text-sm text-gray-700">{state.error}</p>
              <div className="flex gap-3">
                <Button variant="secondary" size="sm" onClick={handleClose}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={handleBack}>
                  Try again
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
