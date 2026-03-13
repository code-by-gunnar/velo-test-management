import { useCallback } from "react"
import { clsx } from "clsx"
import { KeywordPill, type GwtKeyword } from "./KeywordPill"

interface GwtStepRowProps {
  index: number
  action: string
  keyword: GwtKeyword
  isLast: boolean
  readOnly?: boolean
  onChangeText: (index: number, value: string) => void
  onChangeKeyword: (index: number, keyword: GwtKeyword) => void
  onAddAfter: (index: number) => void
  onDelete: (index: number) => void
  pillRef: React.RefCallback<HTMLButtonElement>
  textRef: React.RefCallback<HTMLTextAreaElement>
  onFocusPill: () => void
  onFocusText: () => void
}

export function GwtStepRow({
  index,
  action,
  keyword,
  isLast,
  readOnly = false,
  onChangeText,
  onChangeKeyword,
  onAddAfter,
  onDelete,
  pillRef,
  textRef,
  onFocusPill,
  onFocusText,
}: GwtStepRowProps) {
  const autoResize = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget
    el.style.height = "auto"
    el.style.height = el.scrollHeight + "px"
  }

  // Auto-resize on mount when pre-filled with text
  const textMountRef = useCallback((el: HTMLTextAreaElement | null) => {
    textRef(el)
    if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px" }
  }, [textRef])

  const handleTextKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault()
      onAddAfter(index)
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      onAddAfter(index)
    } else if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault()
      onFocusPill()
    } else if (e.key === "Backspace" && action === "" && index > 0) {
      e.preventDefault()
      onDelete(index)
    }
  }

  return (
    <div className={clsx("flex items-start gap-2", index > 0 && "mt-1")}>
      <KeywordPill
        value={keyword}
        onChange={(kw) => onChangeKeyword(index, kw)}
        readOnly={readOnly}
        pillRef={pillRef}
        textIsEmpty={action === ""}
        {...(index > 0 ? { onDeleteStep: () => onDelete(index) } : {})}
      />
      <textarea
        ref={textMountRef}
        rows={1}
        value={action}
        readOnly={readOnly}
        onChange={(e) => onChangeText(index, e.target.value)}
        onKeyDown={handleTextKeyDown}
        onInput={autoResize}
        placeholder="Step description"
        className="flex-1 resize-none overflow-hidden rounded border border-gray-200 px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        aria-label={`Step ${index + 1} ${keyword} description`}
      />
    </div>
  )
}
