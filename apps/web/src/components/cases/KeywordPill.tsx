import { useState, useRef, useEffect } from "react"
import { clsx } from "clsx"

export type GwtKeyword = "given" | "when" | "then" | "and" | "but"

const KEYWORDS: { value: GwtKeyword; label: string }[] = [
  { value: "given", label: "Given" },
  { value: "when", label: "When" },
  { value: "then", label: "Then" },
  { value: "and", label: "And" },
  { value: "but", label: "But" },
]

interface KeywordPillProps {
  value: GwtKeyword
  onChange: (keyword: GwtKeyword) => void
  readOnly?: boolean
  pillRef?: React.RefCallback<HTMLButtonElement>
  onDeleteStep?: () => void
  textIsEmpty?: boolean
}

export function KeywordPill({ value, onChange, readOnly = false, pillRef, onDeleteStep, textIsEmpty = false }: KeywordPillProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [focusedIndex, setFocusedIndex] = useState(-1)

  const label = KEYWORDS.find((k) => k.value === value)?.label ?? "Given"

  // Close on click outside
  useEffect(() => {
    if (!open) return
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleMouseDown)
    return () => document.removeEventListener("mousedown", handleMouseDown)
  }, [open])

  function handlePillKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      if (!readOnly) setOpen((prev) => !prev)
    } else if (e.key === "Escape" && open) {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === "Backspace" && textIsEmpty && onDeleteStep) {
      e.preventDefault()
      onDeleteStep()
    }
    // Tab is NOT prevented — allows natural focus flow to text field
  }

  function handleDropdownKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      setFocusedIndex((prev) => Math.min(prev + 1, KEYWORDS.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setFocusedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === "Enter" && focusedIndex >= 0 && focusedIndex < KEYWORDS.length) {
      e.preventDefault()
      const selected = KEYWORDS[focusedIndex]
      if (selected) {
        onChange(selected.value)
      }
      setOpen(false)
    }
  }

  function handleSelect(keyword: GwtKeyword) {
    onChange(keyword)
    setOpen(false)
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        ref={pillRef}
        onClick={() => { if (!readOnly) setOpen((prev) => !prev) }}
        onKeyDown={handlePillKeyDown}
        disabled={readOnly}
        className={clsx(
          "w-[60px] rounded px-2 py-1.5 text-xs font-medium text-center transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
          readOnly
            ? "bg-gray-100 text-gray-500 cursor-default"
            : open
              ? "bg-primary-selected text-primary"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200 cursor-pointer"
        )}
      >
        {label}
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-30 mt-1 w-[100px] rounded-md border border-gray-200 bg-white shadow-dropdown"
          onKeyDown={handleDropdownKeyDown}
        >
          {KEYWORDS.map((kw, i) => (
            <button
              key={kw.value}
              type="button"
              onClick={() => handleSelect(kw.value)}
              className={clsx(
                "block w-full px-3 py-1.5 text-left text-sm transition-colors",
                kw.value === value
                  ? "bg-primary-selected text-primary font-medium"
                  : focusedIndex === i
                    ? "bg-gray-50 text-gray-900"
                    : "text-gray-700 hover:bg-gray-50"
              )}
            >
              {kw.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
