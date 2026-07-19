import { useState, useEffect, useRef } from "react"
import { MoreVertical, MoveRight, Copy, CopyPlus } from "lucide-react"
import type { Suite } from "@/hooks/useSuiteTree"
import { SuitePicker } from "./SuitePicker"

interface CaseRowMenuProps {
  caseTitle: string
  suites: Suite[]
  onMove: (targetSuiteId: string | null) => void
  onCopy: (targetSuiteId: string | null) => void
  onDuplicate: () => void
}

type MenuMode = "root" | "move" | "copy"

/**
 * Per-row actions kebab: Move to… / Copy to… / Duplicate for a single case.
 * Surfaces the same operations as the multi-select BulkActionBar so a user
 * doesn't have to check a box first (the reason the feature "felt" missing).
 *
 * The menu is `position: fixed`, anchored to the trigger's rect, so it escapes
 * the case table's `overflow-auto` clipping (an absolute child would be cut off).
 */
export function CaseRowMenu({ caseTitle, suites, onMove, onCopy, onDuplicate }: CaseRowMenuProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<MenuMode>("root")
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  function openMenu() {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      // Right-align the menu under the kebab; anchor to the viewport (fixed).
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
    setMode("root")
    setOpen(true)
  }

  function close() {
    setOpen(false)
    setMode("root")
  }

  // Close on outside click, Escape, or any scroll/resize (a fixed menu can't
  // follow the row as the table scrolls, so dismiss rather than drift).
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      close()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close()
    }
    function onScroll(e: Event) {
      // The suite list inside the menu is itself scrollable — scrolling it (or
      // dragging its scrollbar) must NOT dismiss the menu. Only close when an
      // ancestor (the table container / page) scrolls out from under us.
      if (e.target instanceof Node && menuRef.current?.contains(e.target)) return
      close()
    }
    function onResize() {
      close()
    }
    document.addEventListener("mousedown", onPointerDown)
    window.addEventListener("keydown", onKey)
    // capture:true catches scrolls on the inner table container, not just window.
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", onResize)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", onResize)
    }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          open ? close() : openMenu()
        }}
        aria-label={`Case actions for ${caseTitle}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center justify-center rounded p-1 text-gray-500 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-700 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary group-hover:opacity-100 pointer-coarse:h-11 pointer-coarse:w-11 pointer-coarse:opacity-100"
      >
        <MoreVertical size={16} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          style={{ position: "fixed", top: pos.top, right: pos.right, zIndex: 40 }}
          onClick={(e) => e.stopPropagation()}
          className="min-w-44 rounded border border-gray-200 bg-white py-1 shadow-lg"
        >
          {mode === "root" && (
            <>
              <MenuItem icon={<MoveRight size={14} aria-hidden="true" />} label="Move to…" onClick={() => setMode("move")} />
              <MenuItem icon={<Copy size={14} aria-hidden="true" />} label="Copy to…" onClick={() => setMode("copy")} />
              <MenuItem
                icon={<CopyPlus size={14} aria-hidden="true" />}
                label="Duplicate"
                onClick={() => {
                  close()
                  onDuplicate()
                }}
              />
            </>
          )}
          {(mode === "move" || mode === "copy") && (
            <SuitePicker
              suites={suites}
              positionClassName="relative"
              onSelect={(suiteId) => {
                close()
                if (mode === "move") onMove(suiteId)
                else onCopy(suiteId)
              }}
            />
          )}
        </div>
      )}
    </>
  )
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none"
    >
      <span className="text-gray-500">{icon}</span>
      {label}
    </button>
  )
}
