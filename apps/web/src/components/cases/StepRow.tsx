import React from "react"
import { clsx } from "clsx"

interface StepRowProps {
  index: number
  action: string
  expected_result: string
  isLast: boolean
  onChange: (index: number, field: "action" | "expected_result", value: string) => void
  onAddAfter: (index: number) => void
  onDelete: (index: number) => void
  actionRef: React.RefCallback<HTMLTextAreaElement>
  expectedRef: React.RefCallback<HTMLTextAreaElement>
  onFocusAction: () => void
  onFocusExpected: () => void
}

export function StepRow({
  index,
  action,
  expected_result,
  isLast,
  onChange,
  onAddAfter,
  onDelete,
  actionRef,
  expectedRef,
  onFocusAction,
  onFocusExpected,
}: StepRowProps) {
  const autoResize = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget
    el.style.height = "auto"
    el.style.height = el.scrollHeight + "px"
  }

  const handleActionKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault()
      onFocusExpected()
    } else if (e.key === "Backspace" && action === "" && index > 0) {
      e.preventDefault()
      onDelete(index)
    }
  }

  const handleExpectedKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault()
      onAddAfter(index)
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      onAddAfter(index)
    } else if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault()
      onFocusAction()
    }
  }

  return (
    <div className={clsx("grid grid-cols-2 gap-2", index > 0 && "mt-1")}>
      <textarea
        ref={actionRef}
        rows={1}
        value={action}
        onChange={(e) => onChange(index, "action", e.target.value)}
        onKeyDown={handleActionKeyDown}
        onInput={autoResize}
        placeholder="Action"
        className="resize-none overflow-hidden rounded border border-gray-200 px-2 py-1.5 text-sm focus:border-cobalt focus:outline-none focus:ring-1 focus:ring-cobalt"
        aria-label={`Step ${index + 1} action`}
      />
      <textarea
        ref={expectedRef}
        rows={1}
        value={expected_result}
        onChange={(e) => onChange(index, "expected_result", e.target.value)}
        onKeyDown={handleExpectedKeyDown}
        onInput={autoResize}
        placeholder="Expected result"
        className="resize-none overflow-hidden rounded border border-gray-200 px-2 py-1.5 text-sm focus:border-cobalt focus:outline-none focus:ring-1 focus:ring-cobalt"
        aria-label={`Step ${index + 1} expected result`}
      />
    </div>
  )
}
