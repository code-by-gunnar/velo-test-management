import { useRef, useEffect } from "react"
import { useUserRole } from "@/hooks/useUserRole"
import { type Step } from "./StepEditor"
import { type GwtKeyword } from "./KeywordPill"
import { GwtStepRow } from "./GwtStepRow"

interface GwtStepEditorProps {
  steps: Step[]
  onChange: (steps: Step[]) => void
}

function suggestKeyword(steps: Step[], index: number): GwtKeyword {
  if (index === 0) return "given"
  const prev = steps[index - 1]?.step_type
  switch (prev) {
    case "given": return "when"
    case "when": return "then"
    case "then": return "then"
    case "and":
    case "but":
      // Walk back to find the last primary keyword and suggest what follows
      for (let i = index - 1; i >= 0; i--) {
        const kw = steps[i]?.step_type
        if (kw && kw !== "and" && kw !== "but") {
          return kw === "given" ? "when" : "then"
        }
      }
      return "then"
    default:
      return "given"
  }
}

export function GwtStepEditor({ steps, onChange }: GwtStepEditorProps) {
  const { canEdit } = useUserRole()
  const pillRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map())
  const textRefs = useRef<Map<string, HTMLTextAreaElement | null>>(new Map())

  function focusPill(index: number) {
    pillRefs.current.get(String(index))?.focus()
  }

  function focusText(index: number) {
    textRefs.current.get(String(index))?.focus()
  }

  // Ensure at least one step
  useEffect(() => {
    if (steps.length === 0) {
      onChange([{ action: "", expected_result: "", step_type: "given" }])
    }
  }, [steps.length, onChange])

  const handleChangeText = (index: number, value: string) => {
    const next = steps.map((s, i) => (i === index ? { ...s, action: value } : s))
    onChange(next)
  }

  const handleChangeKeyword = (index: number, keyword: GwtKeyword) => {
    const next = steps.map((s, i) => (i === index ? { ...s, step_type: keyword } : s))
    onChange(next)
  }

  const handleAddAfter = (index: number) => {
    const suggested = suggestKeyword(steps, index + 1)
    const next = [
      ...steps.slice(0, index + 1),
      { action: "", expected_result: "", step_type: suggested },
      ...steps.slice(index + 1),
    ]
    onChange(next)
    setTimeout(() => focusText(index + 1), 0)
  }

  const handleDelete = (index: number) => {
    if (steps.length <= 1) return
    const next = steps.filter((_, i) => i !== index)
    pillRefs.current.delete(String(index))
    textRefs.current.delete(String(index))
    onChange(next)
    setTimeout(() => {
      focusText(Math.max(0, index - 1))
    }, 0)
  }

  if (steps.length === 0) return null

  return (
    <div>
      {steps.map((step, index) => (
        <GwtStepRow
          key={index}
          index={index}
          action={step.action}
          keyword={(step.step_type as GwtKeyword) ?? "given"}
          isLast={index === steps.length - 1}
          readOnly={!canEdit}
          onChangeText={canEdit ? handleChangeText : () => {}}
          onChangeKeyword={canEdit ? handleChangeKeyword : () => {}}
          onAddAfter={canEdit ? handleAddAfter : () => {}}
          onDelete={canEdit ? handleDelete : () => {}}
          pillRef={(el) => { pillRefs.current.set(String(index), el) }}
          textRef={(el) => { textRefs.current.set(String(index), el) }}
          onFocusPill={() => focusPill(index)}
          onFocusText={() => focusText(index)}
        />
      ))}
    </div>
  )
}
