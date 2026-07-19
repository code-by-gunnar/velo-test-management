import { useState, useEffect, useRef } from "react"
import { useUserRole } from "@/hooks/useUserRole"
import { useForm } from "react-hook-form"
import { clsx } from "clsx"
import { Button, Label, Modal } from "@/components/ui"
import { StepEditor, type Step } from "./StepEditor"
import { GwtStepEditor } from "./GwtStepEditor"

interface CasePanelProps {
  isOpen: boolean
  caseId: string | null // null = new case
  workspaceId: string
  projectId: string
  testFormat: string
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
  testFormat,
  selectedSuiteId,
  onClose,
  onSaved,
}: CasePanelProps) {
  const { canEdit } = useUserRole()
  const titleRef = useRef<HTMLInputElement>(null)
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

  // Load case data when opening (Escape/focus are owned by the Modal primitive).
  useEffect(() => {
    if (!isOpen) return

    if (caseId === null) {
      reset({ title: "", priority: "medium", preconditions: "" })
      setSteps(testFormat === "gwt"
        ? [{ action: "", expected_result: "", step_type: "given" }]
        : DEFAULT_STEPS
      )
      setIsEditing(true)
      setViewData(null)
    } else {
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

  // Keyboard: Ctrl/Cmd+S to save, E to enter edit. (Escape is the Modal's.)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
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

  const priorityOptions = [
    { value: "critical", label: "Critical" },
    { value: "high", label: "High" },
    { value: "medium", label: "Medium" },
    { value: "low", label: "Low" },
  ]

  const isCreateMode = caseId === null
  const showForm = isCreateMode || isEditing
  const title = isCreateMode
    ? "New Test Case"
    : isEditing
      ? "Edit Test Case"
      : (viewData?.title ?? "Test Case")

  const footer = showForm ? (
    <>
      <span className="mr-auto self-center text-xs text-gray-400">Ctrl+S to save · Esc to close</span>
      <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
      <Button
        type="button"
        variant="primary"
        size="sm"
        disabled={isSaving}
        onClick={() => void handleSubmit(onSubmit)()}
      >
        {isSaving ? "Saving…" : "Save"}
      </Button>
    </>
  ) : (
    <Button
      variant="secondary"
      size="sm"
      disabled={!canEdit}
      onClick={() => {
        setIsEditing(true)
        setTimeout(() => titleRef.current?.focus(), 0)
      }}
    >
      Edit
    </Button>
  )

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg" footer={footer}>
      {showForm ? (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="case-title">Title</Label>
            <input
              id="case-title"
              {...register("title", { required: "Title is required" })}
              ref={(el) => {
                const rhfField = register("title", { required: "Title is required" })
                if (typeof rhfField.ref === "function") rhfField.ref(el)
                ;(titleRef as { current: typeof el }).current = el
              }}
              placeholder="Test case title"
              className={clsx(
                "w-full rounded-md border px-3 py-2 text-sm text-gray-900 placeholder-gray-400",
                "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
                errors.title ? "border-fail" : "border-gray-200"
              )}
            />
            {errors.title && (
              <p className="text-xs text-fail-text" role="alert">{errors.title.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="case-priority">Priority</Label>
            <select
              id="case-priority"
              {...register("priority")}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {priorityOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="case-preconditions">Preconditions</Label>
            <textarea
              id="case-preconditions"
              {...register("preconditions")}
              rows={2}
              placeholder="Optional preconditions or setup"
              className="mt-1 block w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <Label>Steps</Label>
            <div className="mt-1">
              {testFormat === "gwt" ? (
                <GwtStepEditor steps={steps} onChange={setSteps} />
              ) : (
                <StepEditor steps={steps} onChange={setSteps} />
              )}
            </div>
          </div>
        </form>
      ) : (
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
              ) : testFormat === "gwt" ? (
                <div className="mt-2 space-y-1">
                  {viewData.steps.map((step, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="shrink-0 w-[60px] rounded bg-gray-100 px-2 py-1.5 text-xs font-medium text-gray-700 text-center">
                        {(step.step_type ?? "given").charAt(0).toUpperCase() + (step.step_type ?? "given").slice(1)}
                      </span>
                      <div className="flex-1 whitespace-pre-wrap rounded bg-gray-50 px-2 py-1.5 text-sm text-gray-700">
                        {step.action || <span className="text-gray-300">—</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Action</span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Expected Result</span>
                  </div>
                  {viewData.steps.map((step, i) => (
                    <div key={i} className="grid grid-cols-2 gap-2">
                      <div className="whitespace-pre-wrap rounded bg-gray-50 px-2 py-1.5 text-sm text-gray-700">
                        {step.action || <span className="text-gray-300">—</span>}
                      </div>
                      <div className="whitespace-pre-wrap rounded bg-gray-50 px-2 py-1.5 text-sm text-gray-700">
                        {step.expected_result || <span className="text-gray-300">—</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {canEdit && (
              <p className="text-xs text-gray-400">Press E to edit</p>
            )}
          </div>
        )
      )}
    </Modal>
  )
}
