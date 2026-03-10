import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui"
import { Input, Label, FormField } from "@/components/ui"
import { useSuiteTree } from "@/hooks/useSuiteTree"
import type { RunListItem } from "./RunCard"

interface RunCreateModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: (run: RunListItem) => void
  workspaceId: string
  projectId: string
  assignees: Array<{ id: string; name: string }>
}

export function RunCreateModal({
  isOpen,
  onClose,
  onCreated,
  workspaceId,
  projectId,
  assignees,
}: RunCreateModalProps) {
  const [name, setName] = useState("")
  const [selectedSuiteIds, setSelectedSuiteIds] = useState<Set<string>>(new Set())
  const [allCases, setAllCases] = useState(true)
  const [assignedTo, setAssignedTo] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { flatList: suites, isLoading: suitesLoading } = useSuiteTree(
    isOpen ? workspaceId : "",
    isOpen ? projectId : ""
  )

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName("")
      setSelectedSuiteIds(new Set())
      setAllCases(true)
      setAssignedTo("")
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

      if (!allCases && selectedSuiteIds.size > 0) {
        body.suite_ids = [...selectedSuiteIds]
      }

      if (assignedTo) {
        body.assigned_to = assignedTo
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

      const created = await res.json() as RunListItem
      onCreated(created)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create run")
    } finally {
      setIsSubmitting(false)
    }
  }

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
          <h2 id="run-modal-title" className="text-base font-semibold text-gray-900">
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
          <FormField label="Run Name" htmlFor="run-name" error={error ?? undefined}>
            <Input
              id="run-name"
              placeholder="e.g. Sprint 12 regression"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isSubmitting) {
                  void handleSubmit()
                }
              }}
              autoFocus
              maxLength={255}
            />
          </FormField>

          {/* Suite scope */}
          <div className="flex flex-col gap-2">
            <Label>Test Scope</Label>
            <div className="rounded-lg border border-gray-200 p-3">
              {/* All cases checkbox */}
              <label className="flex cursor-pointer items-center gap-2 py-1 text-sm font-medium text-gray-900">
                <input
                  type="checkbox"
                  checked={allCases}
                  onChange={(e) => {
                    setAllCases(e.target.checked)
                    if (e.target.checked) {
                      setSelectedSuiteIds(new Set())
                    }
                  }}
                  className="h-3.5 w-3.5 rounded border-gray-300 accent-cobalt"
                />
                All Cases
              </label>

              {!allCases && (
                <div className="mt-2 max-h-48 overflow-y-auto border-t border-gray-100 pt-2">
                  {suitesLoading ? (
                    <p className="py-2 text-xs text-gray-400">Loading suites…</p>
                  ) : suites.length === 0 ? (
                    <p className="py-2 text-xs text-gray-400">No suites found</p>
                  ) : (
                    suites.map((suite) => (
                      <label
                        key={suite.id}
                        className="flex cursor-pointer items-center gap-2 py-1 text-sm text-gray-700 hover:text-gray-900"
                        style={{ paddingLeft: `${(suite.depth + 1) * 12}px` }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedSuiteIds.has(suite.id)}
                          onChange={() => toggleSuite(suite.id)}
                          className="h-3.5 w-3.5 rounded border-gray-300 accent-cobalt"
                        />
                        {suite.name}
                      </label>
                    ))
                  )}
                </div>
              )}

              {!allCases && (
                <button
                  type="button"
                  onClick={() => setAllCases(false)}
                  className="mt-1 text-xs text-cobalt underline hover:no-underline"
                >
                  Select specific suites
                </button>
              )}
            </div>
          </div>

          {/* Assignee */}
          {assignees.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="run-assignee">Assign to</Label>
              <select
                id="run-assignee"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-cobalt focus:outline-none focus:ring-1 focus:ring-cobalt"
              >
                <option value="">Unassigned</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-fail-text">
              {error}
            </p>
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
            {isSubmitting ? "Creating…" : "Create Run"}
          </Button>
        </div>
      </div>
    </div>
  )
}
