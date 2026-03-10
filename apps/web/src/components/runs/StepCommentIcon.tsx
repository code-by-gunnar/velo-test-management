import React, { useState, useRef, useEffect, useLayoutEffect } from "react"

export interface StepComment {
  id: string
  step_order: number
  comment: string
  created_at: string
}

interface StepCommentIconProps {
  runItemId: string
  stepOrder: number
  workspaceId: string
  existingComments: StepComment[]
  onCommentAdded?: (comment: StepComment) => void
}

export function StepCommentIcon({
  runItemId,
  stepOrder,
  workspaceId,
  existingComments,
  onCommentAdded,
}: StepCommentIconProps) {
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const [saving, setSaving] = useState(false)
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const allComments = existingComments.filter((c) => c.step_order === stepOrder)
  const hasComments = allComments.length > 0

  // Position popover to avoid clipping
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceRight = window.innerWidth - rect.right

    const style: React.CSSProperties = { position: "fixed", zIndex: 50, width: 256 }

    // Vertical: prefer below, flip above if < 180px room
    if (spaceBelow >= 180) {
      style.top = rect.bottom + 4
    } else {
      style.bottom = window.innerHeight - rect.top + 4
    }

    // Horizontal: prefer right-aligned to button, shift left if clipping
    if (spaceRight >= 260) {
      style.left = rect.left
    } else {
      style.right = 8
    }

    setPopoverStyle(style)
  }, [open])

  // Focus input when popover opens
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
    }
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        popoverRef.current && !popoverRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation()
    if (e.key === "Escape") setOpen(false)
    if (e.key === "Enter") {
      e.preventDefault()
      void handleAdd()
    }
  }

  const handleAdd = async () => {
    const text = inputValue.trim()
    if (!text || saving) return

    setSaving(true)
    try {
      const res = await fetch(
        `/api/backend/workspaces/${workspaceId}/run-items/${runItemId}/step-comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step_order: stepOrder, comment: text }),
        }
      )
      if (!res.ok) throw new Error(`Failed: ${res.status}`)
      const created = await res.json() as StepComment
      setInputValue("")
      onCommentAdded?.(created)
    } catch {
      // Silent — UX continues
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((prev) => !prev)
        }}
        className="relative flex items-center justify-center w-6 h-6 rounded text-gray-300 hover:text-cobalt hover:bg-cobalt/5 transition-colors"
        title={hasComments ? `${allComments.length} comment(s)` : "Add step comment"}
        aria-label="Step comment"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M2 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2v2l3-2h7a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H2z" />
        </svg>
        {hasComments && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-cobalt border border-white" />
        )}
      </button>

      {open && (
        <div ref={popoverRef} style={popoverStyle} className="rounded-lg border border-gray-200 bg-white shadow-xl">
          <div className="px-3 pt-2.5 pb-1 border-b border-gray-100 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Step {stepOrder}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-gray-300 hover:text-gray-500 -mr-1"
              aria-label="Close"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M3 3l6 6M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="p-3">
            {allComments.length > 0 && (
              <ul className="space-y-1.5 mb-2.5 max-h-28 overflow-y-auto">
                {allComments.map((c) => (
                  <li key={c.id} className="text-xs text-gray-700 bg-gray-50 rounded px-2 py-1.5 leading-snug">
                    {c.comment}
                  </li>
                ))}
              </ul>
            )}

            <div className="flex gap-1.5">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Add comment…"
                className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs focus:border-cobalt focus:outline-none focus:ring-1 focus:ring-cobalt"
              />
              <button
                type="button"
                onClick={() => void handleAdd()}
                disabled={!inputValue.trim() || saving}
                className="rounded bg-cobalt px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40 hover:bg-cobalt/90 transition-colors"
              >
                {saving ? "…" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
