import React, { useRef, useEffect, createRef } from "react"
import { StepRow } from "./StepRow"

export interface Step {
  action: string
  expected_result: string
}

interface StepEditorProps {
  steps: Step[]
  onChange: (steps: Step[]) => void
}

function makeStepRef() {
  return {
    action: createRef<HTMLTextAreaElement>(),
    expected: createRef<HTMLTextAreaElement>(),
  }
}

export function StepEditor({ steps, onChange }: StepEditorProps) {
  // Maintain a parallel refs array for each step's action/expected textareas
  const stepRefs = useRef<Array<{ action: React.RefObject<HTMLTextAreaElement | null>; expected: React.RefObject<HTMLTextAreaElement | null> }>>([])

  // Sync refs array length to steps length
  while (stepRefs.current.length < steps.length) {
    stepRefs.current.push(makeStepRef())
  }
  if (stepRefs.current.length > steps.length) {
    stepRefs.current.length = steps.length
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
    // Add a new ref slot
    stepRefs.current.splice(index + 1, 0, makeStepRef())
    onChange(next)
    setTimeout(() => {
      stepRefs.current[index + 1]?.action.current?.focus()
    }, 0)
  }

  const handleDelete = (index: number) => {
    if (steps.length <= 1) return
    const next = steps.filter((_, i) => i !== index)
    stepRefs.current.splice(index, 1)
    onChange(next)
    setTimeout(() => {
      stepRefs.current[index - 1]?.expected.current?.focus()
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
      {steps.map((step, index) => {
        // Ensure refs exist for this index
        if (!stepRefs.current[index]) {
          stepRefs.current[index] = makeStepRef()
        }
        return (
          <StepRow
            key={index}
            index={index}
            action={step.action}
            expected_result={step.expected_result}
            isLast={index === steps.length - 1}
            onChange={handleChange}
            onAddAfter={handleAddAfter}
            onDelete={handleDelete}
            actionRef={stepRefs.current[index]!.action}
            expectedRef={stepRefs.current[index]!.expected}
          />
        )
      })}
    </div>
  )
}
