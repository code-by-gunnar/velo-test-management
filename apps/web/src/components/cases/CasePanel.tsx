import { useState, useEffect, useRef } from "react"
import { useUserRole } from "@/hooks/useUserRole"
import { useForm } from "react-hook-form"
import { clsx } from "clsx"
import { Button, Label } from "@/components/ui"
import { StepEditor, type Step } from "./StepEditor"

interface CasePanelProps {
  isOpen: boolean
  caseId: string | null  // null = new case
  workspaceId: string
  projectId: string
  selectedSuiteId: string | null
  onClose: () => void
  onSaved: () => void
}

interface CaseFormValues {
  title: string
  priority: "critical" | "high" | "medium" | "low"
  preconditions: string
}

const DEFAULT_STEPS: Step[] = [{ action: "", expected_result: "" }]

export function CasePanel({
  isOpen,
  caseId,
  workspaceId,
  projectId,
  selectedSuiteId,
  onClose,
  onSaved,
}: CasePanelProps) {
  const { canEdit } = useUserRole()
  const titleRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const [steps, setSteps] = useState<Step[]>(DEFAULT_STEPS)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [viewData, setViewData] = useState<{
    title: string
    priority: string
    preconditions: string | null
    steps: Step[]
  } | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CaseFormValues>({
    defaultValues: { title: "", priority: "medium", preconditions: "" },
  })

  // Focus management: save opener, focus title on open, restore on close
  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement
      setTimeout(() => titleRef.current?.focus(), 0)
    } else {
      triggerRef.current?.focus()
    }
  }, [isOpen])

  // Load case data when opening an existing case
  useEffect(() => {
    if (!isOpen) return

    if (caseId === null) {
      // New case — reset form
      reset({ title: "", priority: "medium", preconditions: "" })
      setSteps(DEFAULT_STEPS)
      setIsEditing(true)
      setViewData(null)
    } else {
      // Existing case — fetch data
      setIsEditing(false)
      const url = `/api/backend/workspaces/${workspaceId}/projects/${projectId}/cases/${caseId}`
      fetch(url)
        .then((res) => res.ok ? res.json() : null)
        .then((data: { title: string; priority: string; preconditions: string | null; steps: Step[] } | null) => {
          if (!data) return
          setViewData(data)
          reset({
            title: data.title,
            priority: data.priority as CaseFormValues["priority"],
            preconditions: data.preconditions ?? "",
          })
          setSteps(data.steps.length > 0 ? data.steps : DEFAULT_STEPS)
        })
        .catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, caseId])

  // Keyboard shortcuts: Escape to close, Ctrl/Cmd+S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return
      if (e.key === "Escape") {
        onClose()
      } else if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault()
        void handleSubmit(onSubmit)()
      } else if (e.key === "e" || e.key === "E") {
        if (!canEdit) return
        const target = e.target as HTMLElement
        if (!["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) && !isEditing && caseId !== null) {
          setIsEditing(true)
          setTimeout(() => titleRef.current?.focus(), 0)
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isEditing, caseId])

  const onSubmit = async (values: CaseFormValues) => {
    setIsSaving(true)
    try {
      const body: Record<string, unknown> = {
        title: values.title,
        priority: values.priority,
        steps,
      }
      if (selectedSuiteId) body.suite_id = selectedSuiteId
      if (values.preconditions) body.preconditions = values.preconditions

      const url = caseId
        ? `/api/backend/workspaces/${workspaceId}/projects/${projectId}/cases/${caseId}`
        : `/api/backend/workspaces/${workspaceId}/projects/${projectId}/cases`

      const res = await fetch(url, {
        method: caseId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        onSaved()
        onClose()
      }
    } finally {
      setIsSaving(false)
    }
  }

  const priorityOptions = [
    { value: "critical", label: "Critical" },
    { value: "high", label: "High" },
    { value: "medium", label: "Medium" },
    { value: "low", label: "Low" },
  ]

  const isCreateMode = caseId === null
  const showForm = isCreateMode || isEditing

  return (
    <>
      {/* Backdrop (click outside to close) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-10 bg-black/10"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Panel */}
      <div
        className={clsx(
          "fixed right-0 top-0 z-20 h-full w-1/2 transform overflow-y-auto bg-white shadow-xl transition-transform duration-200",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
        role="dialog"
        aria-modal="true"
        aria-label={isCreateMode ? "New test case" : "Test case"}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            {isCreateMode ? "New Test Case" : (isEditing ? "Edit Test Case" : (viewData?.title ?? "Test Case"))}
          </h2>
          <div className="flex items-center gap-2">
            {!isCreateMode && !isEditing && canEdit && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setIsEditing(true)
                  setTimeout(() => titleRef.current?.focus(), 0)
                }}
              >
                Edit
              </Button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Close panel"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Panel body */}
        <div className="px-6 py-4">
          {showForm ? (
            // Edit / Create form
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Title */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="case-title">Title</Label>
                <input
                  id="case-title"
                  {...register("title", { required: "Title is required" })}
                  ref={(el) => {
                    // Merge react-hook-form ref with our titleRef for focus management
                    const rhfField = register("title", { required: "Title is required" })
                    if (typeof rhfField.ref === "function") rhfField.ref(el)
                    ;(titleRef as { current: typeof el }).current = el
                  }}
                  placeholder="Test case title"
                  className={clsx(
                    "w-full rounded-md border px-3 py-2 text-sm text-gray-900 placeholder-gray-400",
                    "focus:border-cobalt focus:outline-none focus:ring-1 focus:ring-cobalt",
                    errors.title ? "border-fail" : "border-gray-200"
                  )}
                />
                {errors.title && (
                  <p className="text-xs text-fail-text" role="alert">{errors.title.message}</p>
                )}
              </div>

              {/* Priority */}
              <div>
                <Label htmlFor="case-priority">Priority</Label>
                <select
                  id="case-priority"
                  {...register("priority")}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-cobalt focus:outline-none focus:ring-1 focus:ring-cobalt"
                >
                  {priorityOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Preconditions */}
              <div>
                <Label htmlFor="case-preconditions">Preconditions</Label>
                <textarea
                  id="case-preconditions"
                  {...register("preconditions")}
                  rows={2}
                  placeholder="Optional preconditions or setup"
                  className="mt-1 block w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-cobalt focus:outline-none focus:ring-1 focus:ring-cobalt"
                />
              </div>

              {/* Steps */}
              <div>
                <Label>Steps</Label>
                <div className="mt-1">
                  <StepEditor steps={steps} onChange={setSteps} />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" variant="primary" size="sm" disabled={isSaving}>
                  {isSaving ? "Saving…" : "Save"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <span className="ml-auto text-xs text-gray-400">Ctrl+S to save · Esc to close</span>
              </div>
            </form>
          ) : (
            // View mode
            viewData && (
              <div className="space-y-4">
                <div>
                  <Label>Priority</Label>
                  <p className="mt-1 text-sm capitalize text-gray-700">{viewData.priority}</p>
                </div>
                {viewData.preconditions && (
                  <div>
                    <Label>Preconditions</Label>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{viewData.preconditions}</p>
                  </div>
                )}
                <div>
                  <Label>Steps</Label>
                  {viewData.steps.length === 0 ? (
                    <p className="mt-1 text-sm text-gray-400">No steps</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Action</span>
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Expected Result</span>
                      </div>
                      {viewData.steps.map((step, i) => (
                        <div key={i} className="grid grid-cols-2 gap-2">
                          <div className="rounded bg-gray-50 px-2 py-1.5 text-sm text-gray-700">
                            {step.action || <span className="text-gray-300">—</span>}
                          </div>
                          <div className="rounded bg-gray-50 px-2 py-1.5 text-sm text-gray-700">
                            {step.expected_result || <span className="text-gray-300">—</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {canEdit && (
                  <div className="pt-2">
                    <span className="text-xs text-gray-400">Press E to edit</span>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </>
  )
}
