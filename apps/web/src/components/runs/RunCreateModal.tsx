import { useState, useEffect, useCallback, useMemo } from "react"
import { clsx } from "clsx"
import { Button } from "@/components/ui"
import { Input, Label, FormField } from "@/components/ui"
import { useSuiteTree } from "@/hooks/useSuiteTree"
import { Layers, ListFilter, Search } from "lucide-react"
import type { RunListItem } from "./RunCard"

type ScopeMode = "all" | "suites"

interface RunCreateModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: (run: RunListItem) => void
  workspaceId: string
  projectId: string
}

export function RunCreateModal({
  isOpen,
  onClose,
  onCreated,
  workspaceId,
  projectId,
}: RunCreateModalProps) {
  const [name, setName] = useState("")
  const [scopeMode, setScopeMode] = useState<ScopeMode>("all")
  const [selectedSuiteIds, setSelectedSuiteIds] = useState<Set<string>>(new Set())
  const [suiteFilter, setSuiteFilter] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { flatList: suites, isLoading: suitesLoading } = useSuiteTree(
    isOpen ? workspaceId : "",
    isOpen ? projectId : ""
  )

  const filteredSuites = useMemo(() => {
    if (!suiteFilter.trim()) return suites
    const q = suiteFilter.toLowerCase()
    return suites.filter((s) => s.name.toLowerCase().includes(q))
  }, [suites, suiteFilter])

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName("")
      setScopeMode("all")
      setSelectedSuiteIds(new Set())
      setSuiteFilter("")
      setError(null)
      setIsSubmitting(false)
    }
  }, [isOpen])

  // Esc closes modal
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  const toggleSuite = useCallback((suiteId: string) => {
    setSelectedSuiteIds((prev) => {
      const next = new Set(prev)
      if (next.has(suiteId)) {
        next.delete(suiteId)
      } else {
        next.add(suiteId)
      }
      return next
    })
  }, [])

  const handleSubmit = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError("Run name is required")
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const body: Record<string, unknown> = {
        name: trimmedName,
        project_id: projectId,
      }

      if (scopeMode === "suites" && selectedSuiteIds.size > 0) {
        body.suite_ids = [...selectedSuiteIds]
      }

      const res = await fetch(
        `/api/backend/workspaces/${workspaceId}/runs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      )

      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? "Failed to create run")
      }

      const data = await res.json() as {
        id: string
        name: string
        status: string
        assigned_to: string | null
        item_count: number
      }
      const created: RunListItem = {
        id: data.id,
        name: data.name,
        status: data.status,
        assigned_to: data.assigned_to,
        assigned_to_name: null,
        created_by_name: null,
        started_at: new Date().toISOString(),
        completed_at: null,
        created_at: new Date().toISOString(),
        total_items: data.item_count,
        pass_count: 0,
        fail_count: 0,
        blocked_count: 0,
        skipped_count: 0,
        untested_count: data.item_count,
      }
      onCreated(created)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create run")
    } finally {
      setIsSubmitting(false)
    }
  }

  const buttonLabel = isSubmitting
    ? "Creating…"
    : scopeMode === "suites" && selectedSuiteIds.size > 0
      ? `Create Run · ${selectedSuiteIds.size} suite${selectedSuiteIds.size === 1 ? "" : "s"}`
      : "Create Run"

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="relative w-full max-w-lg rounded-xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 id="run-modal-title" className="text-base font-semibold text-gray-900 font-display">
            New Test Run
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            &#10005;
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-5 px-6 py-5">
          {/* Run name */}
          <FormField label="Run name" htmlFor="run-name" error={error ?? undefined}>
            <Input
              id="run-name"
              placeholder="e.g. Sprint 12 regression"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null) }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isSubmitting) {
                  void handleSubmit()
                }
              }}
              autoFocus
              maxLength={255}
            />
          </FormField>

          {/* Scope selection */}
          <div className="flex flex-col gap-2">
            <Label>Test scope</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { setScopeMode("all"); setSelectedSuiteIds(new Set()); setSuiteFilter("") }}
                className={clsx(
                  "flex items-center gap-2.5 rounded-md border p-3 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
                  scopeMode === "all"
                    ? "border-primary bg-primary-selected"
                    : "border-gray-200 bg-white hover:border-gray-300"
                )}
              >
                <Layers size={16} className={scopeMode === "all" ? "text-primary" : "text-gray-400"} />
                <div>
                  <p className={clsx("text-sm font-medium", scopeMode === "all" ? "text-primary" : "text-gray-900")}>
                    All cases
                  </p>
                  <p className="text-xs text-gray-500">Every case in the project</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setScopeMode("suites")}
                className={clsx(
                  "flex items-center gap-2.5 rounded-md border p-3 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
                  scopeMode === "suites"
                    ? "border-primary bg-primary-selected"
                    : "border-gray-200 bg-white hover:border-gray-300"
                )}
              >
                <ListFilter size={16} className={scopeMode === "suites" ? "text-primary" : "text-gray-400"} />
                <div>
                  <p className={clsx("text-sm font-medium", scopeMode === "suites" ? "text-primary" : "text-gray-900")}>
                    Specific suites
                  </p>
                  <p className="text-xs text-gray-500">Pick which suites to include</p>
                </div>
              </button>
            </div>
          </div>

          {/* Suite picker (visible when "Specific suites" selected) */}
          {scopeMode === "suites" && (
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              {/* Search */}
              <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
                <Search size={14} className="shrink-0 text-gray-400" />
                <input
                  type="text"
                  value={suiteFilter}
                  onChange={(e) => setSuiteFilter(e.target.value)}
                  placeholder="Filter suites…"
                  className="w-full bg-transparent text-sm text-gray-700 placeholder-gray-400 focus:outline-none"
                />
              </div>

              {/* Suite list */}
              <div className="max-h-56 overflow-y-auto px-1 py-1">
                {suitesLoading ? (
                  <p className="px-3 py-3 text-xs text-gray-400">Loading suites…</p>
                ) : filteredSuites.length === 0 && suiteFilter ? (
                  <p className="px-3 py-3 text-xs text-gray-400">
                    No suites matching &ldquo;{suiteFilter}&rdquo;
                  </p>
                ) : filteredSuites.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-gray-400">
                    No suites in this project. Create suites first.
                  </p>
                ) : (
                  filteredSuites.map((suite) => (
                    <label
                      key={suite.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                      style={{ paddingLeft: `${suite.depth * 12 + 8}px` }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSuiteIds.has(suite.id)}
                        onChange={() => toggleSuite(suite.id)}
                        className="h-3.5 w-3.5 rounded border-gray-300 accent-primary"
                      />
                      {suite.name}
                    </label>
                  ))
                )}
              </div>

              {/* Selection summary */}
              {selectedSuiteIds.size > 0 && (
                <div className="border-t border-gray-100 px-3 py-2">
                  <p className="text-xs text-gray-500">
                    {selectedSuiteIds.size} suite{selectedSuiteIds.size === 1 ? "" : "s"} selected
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-fail">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting || !name.trim()}
          >
            {buttonLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
