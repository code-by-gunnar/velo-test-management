import React, { useRef, useEffect } from "react"
import { StepRow } from "./StepRow"

export interface Step {
  action: string
  expected_result: string
}

interface StepEditorProps {
  steps: Step[]
  onChange: (steps: Step[]) => void
}

export function StepEditor({ steps, onChange }: StepEditorProps) {
  // Store DOM elements via callback refs — never read during render
  const elementsRef = useRef<Map<string, HTMLTextAreaElement | null>>(new Map())

  function elementKey(index: number, field: "action" | "expected") {
    return `${index}-${field}`
  }

  function focusElement(index: number, field: "action" | "expected") {
    elementsRef.current.get(elementKey(index, field))?.focus()
  }

  // Ensure we have at least one step
  useEffect(() => {
    if (steps.length === 0) {
      onChange([{ action: "", expected_result: "" }])
    }
  }, [steps.length, onChange])

  const handleChange = (index: number, field: "action" | "expected_result", value: string) => {
    const next = steps.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    onChange(next)
  }

  const handleAddAfter = (index: number) => {
    const next = [
      ...steps.slice(0, index + 1),
      { action: "", expected_result: "" },
      ...steps.slice(index + 1),
    ]
    onChange(next)
    setTimeout(() => {
      focusElement(index + 1, "action")
    }, 0)
  }

  const handleDelete = (index: number) => {
    if (steps.length <= 1) return
    const next = steps.filter((_, i) => i !== index)
    elementsRef.current.delete(elementKey(index, "action"))
    elementsRef.current.delete(elementKey(index, "expected"))
    onChange(next)
    setTimeout(() => {
      focusElement(index - 1, "expected")
    }, 0)
  }

  if (steps.length === 0) return null

  return (
    <div>
      {/* Column headers */}
      <div className="mb-1 grid grid-cols-2 gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Action</span>
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Expected Result</span>
      </div>

      {/* Step rows */}
      {steps.map((step, index) => (
        <StepRow
          key={index}
          index={index}
          action={step.action}
          expected_result={step.expected_result}
          isLast={index === steps.length - 1}
          onChange={handleChange}
          onAddAfter={handleAddAfter}
          onDelete={handleDelete}
          actionRef={(el) => { elementsRef.current.set(elementKey(index, "action"), el) }}
          expectedRef={(el) => { elementsRef.current.set(elementKey(index, "expected"), el) }}
          onFocusAction={() => focusElement(index, "action")}
          onFocusExpected={() => focusElement(index, "expected")}
        />
      ))}
    </div>
  )
}
