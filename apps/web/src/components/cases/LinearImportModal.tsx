import { useState, useEffect } from "react"
import { clsx } from "clsx"
import { Button, Input, Label } from "@/components/ui"
import { useLinearImport, type SuggestedCase } from "@/hooks/useLinearImport"
import { ExternalLink, Trash2, Loader2, Sparkles, Check } from "lucide-react"

interface LinearImportModalProps {
  isOpen: boolean
  workspaceId: string
  projectId: string
  testFormat: string
  selectedSuiteId: string | null
  onClose: () => void
  onSuccess: () => void
}

export function LinearImportModal({
  isOpen,
  workspaceId,
  projectId,
  testFormat,
  selectedSuiteId,
  onClose,
  onSuccess,
}: LinearImportModalProps) {
  const [issueId, setIssueId] = useState("")
  const { state, fetchAndParse, updateCase, removeCase, saveCases, reset } = useLinearImport({
    workspaceId,
    projectId,
    onSuccess: () => { onSuccess() },
  })

  // Esc to close
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  const handleFetch = () => {
    if (issueId.trim()) {
      void fetchAndParse(issueId)
    }
  }

  const handleImport = () => {
    void saveCases(selectedSuiteId)
  }

  if (!isOpen) return null

  const isWide = state.status === "preview" || state.status === "saving"

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className={clsx(
          "relative rounded-xl bg-white shadow-2xl transition-all",
          isWide ? "w-full max-w-4xl" : "w-full max-w-md"
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="linear-import-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-primary" />
            <h2 id="linear-import-title" className="text-base font-semibold text-gray-900 font-display">
              Import from Linear
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            &#10005;
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* Idle / Error: issue input */}
          {(state.status === "idle" || state.status === "error" || state.status === "fetching") && (
            <div className="flex flex-col gap-4">
              <div>
                <Label htmlFor="linear-issue-id">Linear issue ID</Label>
                <p className="mt-0.5 text-xs text-gray-400">
                  Paste the issue identifier (e.g. VEL-42)
                </p>
              </div>
              <div className="flex gap-2">
                <Input
                  id="linear-issue-id"
                  value={issueId}
                  onChange={(e) => setIssueId(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleFetch() }}
                  placeholder="VEL-42"
                  autoFocus
                  className="flex-1"
                  disabled={state.status === "fetching"}
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleFetch}
                  disabled={!issueId.trim() || state.status === "fetching"}
                >
                  {state.status === "fetching" ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    "Fetch"
                  )}
                </Button>
              </div>

              {state.status === "fetching" && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 size={14} className="animate-spin" />
                  Fetching issue and generating test cases…
                </div>
              )}

              {state.error && (
                <p className="text-sm text-fail">{state.error}</p>
              )}
            </div>
          )}

          {/* Preview: two-panel layout */}
          {(state.status === "preview" || state.status === "saving") && state.issue && (
            <div className="flex gap-6">
              {/* Left: source spec */}
              <div className="w-2/5 shrink-0">
                <div className="sticky top-0">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      {state.issue.identifier}
                    </span>
                    <a
                      href={state.issue.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      Open in Linear <ExternalLink size={10} />
                    </a>
                  </div>

                  <h3 className="text-sm font-semibold text-gray-900 mb-2">{state.issue.title}</h3>

                  <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div className="prose prose-sm prose-gray max-w-none text-xs text-gray-600 whitespace-pre-wrap break-words">
                      {state.issue.description}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: generated test cases */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-gray-700">
                    {state.suggestedCases.length} test case{state.suggestedCases.length === 1 ? "" : "s"} generated
                  </p>
                  <span className="text-xs text-gray-400">
                    {testFormat === "gwt" ? "Given-When-Then" : "Traditional Steps"}
                  </span>
                </div>

                {state.suggestedCases.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center">
                    <p className="text-sm text-gray-500">
                      No test cases could be extracted from this issue.
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      The description may not contain testable acceptance criteria.
                    </p>
                  </div>
                ) : (
                  <div className="max-h-[50vh] overflow-y-auto space-y-3 pr-1">
                    {state.suggestedCases.map((tc, caseIdx) => (
                      <CasePreviewCard
                        key={caseIdx}
                        testCase={tc}
                        testFormat={testFormat}
                        onUpdate={(updated) => updateCase(caseIdx, updated)}
                        onRemove={() => removeCase(caseIdx)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Done */}
          {state.status === "done" && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-pass-bg">
                <Check size={24} className="text-pass" />
              </div>
              <p className="text-sm font-medium text-gray-900">
                Imported {state.savedCount} test case{state.savedCount === 1 ? "" : "s"} from {state.issue?.identifier}
              </p>
              <Button variant="secondary" size="sm" onClick={onClose}>
                Done
              </Button>
            </div>
          )}
        </div>

        {/* Footer (preview mode only) */}
        {(state.status === "preview" || state.status === "saving") && state.suggestedCases.length > 0 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
            <button
              type="button"
              onClick={() => { reset(); setIssueId("") }}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Start over
            </button>
            <div className="flex items-center gap-3">
              <Button variant="secondary" size="sm" onClick={onClose} disabled={state.status === "saving"}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleImport}
                disabled={state.status === "saving" || state.suggestedCases.length === 0}
              >
                {state.status === "saving" ? (
                  <>
                    <Loader2 size={14} className="mr-1.5 animate-spin" />
                    Importing…
                  </>
                ) : (
                  `Import ${state.suggestedCases.length} case${state.suggestedCases.length === 1 ? "" : "s"}`
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Case Preview Card ────────────────────────────────────────────────────────

function CasePreviewCard({
  testCase,
  testFormat,
  onUpdate,
  onRemove,
}: {
  testCase: SuggestedCase
  testFormat: string
  onUpdate: (tc: SuggestedCase) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-start gap-2">
        <input
          type="text"
          value={testCase.title}
          onChange={(e) => onUpdate({ ...testCase, title: e.target.value })}
          className="flex-1 rounded border border-transparent px-1 py-0.5 text-sm font-medium text-gray-900 hover:border-gray-200 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded p-1 text-gray-300 hover:bg-gray-100 hover:text-gray-500"
          aria-label="Remove test case"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="mt-2 space-y-1">
        {testCase.steps.map((step, stepIdx) => (
          <div key={stepIdx} className="flex items-start gap-2 text-xs">
            {testFormat === "gwt" ? (
              <>
                <span className="shrink-0 w-[50px] rounded bg-gray-100 px-1.5 py-1 font-medium text-gray-600 text-center">
                  {(step.step_type ?? "given").charAt(0).toUpperCase() + (step.step_type ?? "given").slice(1)}
                </span>
                <span className="flex-1 py-1 text-gray-700">{step.action}</span>
              </>
            ) : (
              <>
                <span className="flex-1 py-1 text-gray-700">
                  <span className="font-medium text-gray-500">Action:</span> {step.action}
                </span>
                {step.expected_result && (
                  <span className="flex-1 py-1 text-gray-500">
                    <span className="font-medium">Expected:</span> {step.expected_result}
                  </span>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
