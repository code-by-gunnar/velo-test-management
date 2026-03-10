import React, { useState, useRef, useEffect } from "react"

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
  const [localComments, setLocalComments] = useState<StepComment[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const stepComments = existingComments.filter((c) => c.step_order === stepOrder)
  const allComments = [...stepComments, ...localComments]
  const hasComments = allComments.length > 0

  // Focus input when popover opens
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
    }
  }, [open])

  // Close popover on outside click
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  // Prevent keyboard shortcuts from firing when input is focused
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation()
    if (e.key === "Escape") {
      setOpen(false)
    }
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
      if (!res.ok) throw new Error(`Failed to add comment: ${res.status}`)
      const created = await res.json() as StepComment
      setLocalComments((prev) => [...prev, created])
      setInputValue("")
      onCommentAdded?.(created)
    } catch {
      // Silent fail — comment will not persist but UX continues
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative inline-block" ref={popoverRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((prev) => !prev)
        }}
        className="relative flex items-center justify-center w-6 h-6 rounded text-gray-400 hover:text-cobalt hover:bg-cobalt-light transition-colors"
        title={hasComments ? `${allComments.length} comment(s)` : "Add step comment"}
        aria-label="Step comment"
      >
        {/* Chat bubble icon */}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M2 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2v2l3-2h7a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H2z" />
        </svg>
        {/* Dot indicator */}
        {hasComments && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-cobalt border border-white" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-50 w-72 rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="p-3">
            <p className="text-xs font-medium text-gray-500 mb-2">Step {stepOrder} comments</p>

            {allComments.length > 0 ? (
              <ul className="space-y-2 mb-3 max-h-32 overflow-y-auto">
                {allComments.map((c) => (
                  <li key={c.id} className="text-xs text-gray-700 bg-gray-50 rounded px-2 py-1.5">
                    {c.comment}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-400 mb-3">No comments yet.</p>
            )}

            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Add comment..."
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs focus:border-cobalt focus:outline-none focus:ring-1 focus:ring-cobalt"
              />
              <button
                type="button"
                onClick={() => void handleAdd()}
                disabled={!inputValue.trim() || saving}
                className="rounded bg-cobalt px-2 py-1 text-xs font-medium text-white disabled:opacity-40 hover:bg-cobalt-dark transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
