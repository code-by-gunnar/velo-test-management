import { useState, useEffect } from "react"
import { useSuiteTree } from "@/hooks/useSuiteTree"
import { useTestCases } from "@/hooks/useTestCases"
import { SuiteTree } from "./SuiteTree"
import { CaseList } from "./CaseList"
import { CasePanel } from "./CasePanel"
import { ImportModal } from "./ImportModal"

interface CasesPageProps {
  workspaceId: string
  projectId: string
}

export function CasesPage({ workspaceId, projectId }: CasesPageProps) {
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

  // N key shortcut to open new case panel (when panel is closed)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if panel is open or focus is in a form element
      if (panelOpen) return
      const target = e.target as HTMLElement
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return
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
  }

  // Find selected suite for breadcrumb
  const selectedSuite = selectedSuiteId
    ? flatList.find((s) => s.id === selectedSuiteId) ?? null
    : null

  return (
    <div className="flex h-full flex-row overflow-hidden">
      {/* Left panel: Suite tree */}
      <div className="shrink-0 border-r border-gray-200 bg-white" style={{ width: 144 }}>
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
        onClose={() => setImportOpen(false)}
        onSuccess={handleImportSuccess}
      />

      {/* Right panel: Case editor (slide-in) */}
      <CasePanel
        isOpen={panelOpen}
        caseId={openCaseId}
        workspaceId={workspaceId}
        projectId={projectId}
        selectedSuiteId={selectedSuiteId}
        onClose={handleClosePanel}
        onSaved={handleSaved}
      />
    </div>
  )
}
