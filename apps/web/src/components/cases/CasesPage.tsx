import { useState, useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react"
import { useSuiteTree } from "@/hooks/useSuiteTree"
import { useTestCases } from "@/hooks/useTestCases"
import { SuiteTree } from "./SuiteTree"
import { CaseList } from "./CaseList"
import { CasePanel } from "./CasePanel"
import { ImportModal } from "./ImportModal"
import { LinearImportModal } from "./LinearImportModal"

interface CasesPageProps {
  workspaceId: string
  projectId: string
  testFormat: string
}

// Resizable suite sidebar bounds + persistence key (localStorage — a durable layout pref).
const SUITE_MIN_WIDTH = 160
const SUITE_MAX_WIDTH = 460
const SUITE_DEFAULT_WIDTH = 200
const SUITE_WIDTH_KEY = "velo:cases:suiteWidth"

function clampSuiteWidth(w: number): number {
  return Math.max(SUITE_MIN_WIDTH, Math.min(SUITE_MAX_WIDTH, w))
}

export function CasesPage({ workspaceId, projectId, testFormat }: CasesPageProps) {
  const {
    tree,
    flatList,
    selected: selectedSuiteId,
    setSelected: setSelectedSuiteId,
    isLoading: suitesLoading,
    refetch: refetchSuites,
  } = useSuiteTree(workspaceId, projectId)

  const { cases, setCases, isLoading, refetch: refetchCases } = useTestCases(workspaceId, projectId, selectedSuiteId)

  const [panelOpen, setPanelOpen] = useState(false)
  const [openCaseId, setOpenCaseId] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [linearImportOpen, setLinearImportOpen] = useState(false)

  // Resizable suite sidebar. Width read from localStorage on first render (lazy
  // init) and persisted on drag end / reset.
  const [suiteWidth, setSuiteWidth] = useState<number>(() => {
    if (typeof window === "undefined") return SUITE_DEFAULT_WIDTH
    const stored = window.localStorage.getItem(SUITE_WIDTH_KEY)
    const parsed = stored ? parseInt(stored, 10) : NaN
    return Number.isFinite(parsed) ? clampSuiteWidth(parsed) : SUITE_DEFAULT_WIDTH
  })
  const sidebarRef = useRef<HTMLDivElement>(null)

  // During drag we mutate the sidebar's width imperatively (rAF-batched, one
  // layout per frame) instead of calling setState per mousemove — a state update
  // would re-render the whole cases page (SuiteTree + full CaseList) every event
  // and drop frames. State is committed once on mouse-up to sync React + persist.
  const handleSuiteResizeStart = (e: ReactMouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = suiteWidth
    const el = sidebarRef.current
    let latest = startWidth
    let frame = 0
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    const onMove = (ev: MouseEvent) => {
      latest = clampSuiteWidth(startWidth + (ev.clientX - startX))
      if (!frame) {
        frame = window.requestAnimationFrame(() => {
          frame = 0
          if (el) el.style.width = `${latest}px`
        })
      }
    }
    const onUp = () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      if (frame) window.cancelAnimationFrame(frame)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      setSuiteWidth(latest)
      window.localStorage.setItem(SUITE_WIDTH_KEY, String(latest))
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  const handleSuiteResetWidth = () => {
    setSuiteWidth(SUITE_DEFAULT_WIDTH)
    window.localStorage.setItem(SUITE_WIDTH_KEY, String(SUITE_DEFAULT_WIDTH))
  }

  // N key shortcut to open new case panel (when panel is closed)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if panel is open or focus is in a form element
      if (panelOpen) return
      const target = e.target as HTMLElement
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return
      // The suites sidebar owns "n" (create suite) when focused — don't also
      // open the case editor, or one keypress opens two overlays.
      if (sidebarRef.current?.contains(target)) return
      if (e.key === "n" || e.key === "N") {
        e.preventDefault()
        setOpenCaseId(null)
        setPanelOpen(true)
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [panelOpen])

  const handleNewCase = () => {
    setOpenCaseId(null)
    setPanelOpen(true)
  }

  const handleOpenCase = (id: string) => {
    setOpenCaseId(id)
    setPanelOpen(true)
  }

  const handleClosePanel = () => {
    setPanelOpen(false)
    setOpenCaseId(null)
  }

  const handleSaved = () => {
    void refetchCases()
  }

  const handleImportSuccess = () => {
    setImportOpen(false)
    void refetchCases()
    void refetchSuites()
  }

  const handleLinearImportSuccess = () => {
    void refetchCases()
  }

  // Find selected suite for breadcrumb
  const selectedSuite = selectedSuiteId
    ? flatList.find((s) => s.id === selectedSuiteId) ?? null
    : null

  return (
    <div className="flex h-full flex-row overflow-hidden">
      {/* Left panel: Suite tree (resizable) */}
      <div
        ref={sidebarRef}
        className="relative shrink-0 border-r border-gray-200 bg-white"
        style={{ width: suiteWidth }}
        suppressHydrationWarning
      >
        <SuiteTree
          tree={tree}
          isLoading={suitesLoading}
          selected={selectedSuiteId}
          onSelect={setSelectedSuiteId}
          workspaceId={workspaceId}
          projectId={projectId}
          onSuiteCreated={refetchSuites}
          onSuiteReordered={refetchSuites}
        />
        {/* Drag handle: resize the sidebar; double-click to reset to default */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize suites sidebar"
          title="Drag to resize · double-click to reset"
          onMouseDown={handleSuiteResizeStart}
          onDoubleClick={handleSuiteResetWidth}
          className="group absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize"
        >
          <div className="pointer-events-none absolute inset-y-0 right-1 w-px bg-transparent transition-colors group-hover:bg-primary" />
        </div>
      </div>

      {/* Center panel: Case list */}
      <div className="flex-1 overflow-hidden">
        <CaseList
          cases={cases}
          isLoading={isLoading}
          selectedSuite={selectedSuite}
          suites={flatList}
          workspaceId={workspaceId}
          projectId={projectId}
          onNewCase={handleNewCase}
          onImport={() => setImportOpen(true)}
          onLinearImport={() => setLinearImportOpen(true)}
          onOpenCase={handleOpenCase}
          onCasesChange={setCases}
          refetch={refetchCases}
        />
      </div>

      {/* Import modal */}
      <ImportModal
        isOpen={importOpen}
        workspaceId={workspaceId}
        projectId={projectId}
        testFormat={testFormat}
        onClose={() => setImportOpen(false)}
        onSuccess={handleImportSuccess}
      />

      {/* Linear AI import modal — keyed to remount on each open for clean state */}
      {linearImportOpen && (
        <LinearImportModal
          isOpen
          workspaceId={workspaceId}
          projectId={projectId}
          testFormat={testFormat}
          selectedSuiteId={selectedSuiteId}
          onClose={() => setLinearImportOpen(false)}
          onSuccess={handleLinearImportSuccess}
        />
      )}

      {/* Case editor popup — mounted only while open for fresh per-open state */}
      {panelOpen && (
        <CasePanel
          isOpen={panelOpen}
          caseId={openCaseId}
          workspaceId={workspaceId}
          projectId={projectId}
          testFormat={testFormat}
          selectedSuiteId={selectedSuiteId}
          onClose={handleClosePanel}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
