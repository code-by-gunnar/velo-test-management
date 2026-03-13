import React, { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/router"
import { useUserRole } from "@/hooks/useUserRole"
import { useKeyboardExecution } from "@/hooks/useKeyboardExecution"
import type { Verdict } from "@/hooks/useKeyboardExecution"
import { DefectPrompt } from "./DefectPrompt"
import { StepCommentIcon } from "./StepCommentIcon"
import type { StepComment } from "./StepCommentIcon"
import { ExecutionHistory } from "./ExecutionHistory"
import { StatusBadge } from "@/components/ui/status-badge"
import { SegmentedBar } from "./SegmentedBar"
import { Button } from "@/components/ui/button"
import { Menu, ChevronLeft, ChevronRight } from "lucide-react"

export interface RunItem {
  id: string
  test_case_id: string
  case_title: string
  status: string
  comment: string | null
  position: number
}

interface CaseStep {
  step_order: number
  action: string
  expected_result: string
  step_type?: string
}

interface CaseDetail {
  id: string
  title: string
  preconditions: string | null
  steps: CaseStep[]
}

interface ExecutionScreenProps {
  runId: string
  runName: string
  workspaceId: string
  projectId: string
  testFormat: string
  items: RunItem[]
  slug: string
  projectKey: string
  startIndex?: number | null
}

const UNTESTED_STATUSES = new Set(["untested", "pending", ""])

function findFirstUntested(items: RunItem[]): number {
  const idx = items.findIndex((it) => UNTESTED_STATUSES.has(it.status))
  return idx >= 0 ? idx : 0
}

function computeStats(items: RunItem[]) {
  let pass = 0, fail = 0, blocked = 0, skipped = 0, untested = 0
  for (const it of items) {
    if (it.status === "pass") pass++
    else if (it.status === "fail") fail++
    else if (it.status === "blocked") blocked++
    else if (it.status === "skipped") skipped++
    else untested++
  }
  return { pass, fail, blocked, skipped, untested, total: items.length }
}

const VERDICT_MINI: Record<string, { label: string; className: string }> = {
  pass: { label: "P", className: "bg-pass-bg text-pass-text border-pass/30" },
  fail: { label: "F", className: "bg-fail-bg text-fail-text border-fail/30" },
  blocked: { label: "B", className: "bg-blocked-bg text-blocked-text border-blocked/30" },
  skipped: { label: "S", className: "bg-skipped-bg text-skipped-text border-skipped/30" },
}

export function ExecutionScreen({
  runId,
  runName,
  workspaceId,
  projectId,
  testFormat,
  items: initialItems,
  slug,
  projectKey,
  startIndex: startIndexProp,
}: ExecutionScreenProps) {
  const router = useRouter()
  const { canEdit } = useUserRole()

  const [items, setItems] = useState<RunItem[]>(initialItems)
  const [currentIndex, setCurrentIndex] = useState(() => {
    if (startIndexProp != null && startIndexProp >= 0 && startIndexProp < initialItems.length) {
      return startIndexProp
    }
    return findFirstUntested(initialItems)
  })
  const [showDefectPrompt, setShowDefectPrompt] = useState(false)
  const [caseDetailCache, setCaseDetailCache] = useState<Record<string, CaseDetail>>({})
  const [stepCommentCache, setStepCommentCache] = useState<Record<string, StepComment[]>>({})
  const [loadingCase, setLoadingCase] = useState(false)
  const [deletedCaseIds, setDeletedCaseIds] = useState<Set<string>>(new Set())
  const [done, setDone] = useState(false)
  const [commentValue, setCommentValue] = useState("")
  const [commentSaved, setCommentSaved] = useState(true)
  const commentSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [commentFocused, setCommentFocused] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const currentItem = items[currentIndex]
  const currentDetail = currentItem ? caseDetailCache[currentItem.test_case_id] : undefined

  // Keyboard shortcuts disabled when defect prompt open or comment textarea focused
  const keyboardEnabled = !showDefectPrompt && !commentFocused && !done

  // Fetch case detail on index change
  useEffect(() => {
    if (!currentItem) return
    const caseId = currentItem.test_case_id
    if (caseDetailCache[caseId]) return

    setLoadingCase(true)
    fetch(`/api/backend/workspaces/${workspaceId}/projects/${projectId}/cases/${caseId}`)
      .then((res) => {
        if (res.status === 404) {
          setDeletedCaseIds((prev) => new Set(prev).add(caseId))
          return null
        }
        if (!res.ok) throw new Error(`Failed to fetch case: ${res.status}`)
        return res.json() as Promise<CaseDetail>
      })
      .then((detail) => {
        if (detail) setCaseDetailCache((prev) => ({ ...prev, [caseId]: detail }))
      })
      .catch(() => {
        // Continue without steps
      })
      .finally(() => setLoadingCase(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex])

  // Fetch step comments for current item
  useEffect(() => {
    if (!currentItem) return
    const itemId = currentItem.id
    if (stepCommentCache[itemId] !== undefined) return

    fetch(`/api/backend/workspaces/${workspaceId}/run-items/${itemId}/step-comments`)
      .then((res) => {
        if (!res.ok) return []
        return res.json() as Promise<StepComment[]>
      })
      .then((comments) => {
        setStepCommentCache((prev) => ({ ...prev, [itemId]: comments }))
      })
      .catch(() => {
        setStepCommentCache((prev) => ({ ...prev, [itemId]: [] }))
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex])

  // Sync comment textarea with current item's stored comment
  useEffect(() => {
    setCommentValue(currentItem?.comment ?? "")
    setCommentSaved(true)
  }, [currentIndex, currentItem])

  const navigateTo = useCallback((idx: number) => {
    if (idx < 0 || idx >= items.length) return
    setCurrentIndex(idx)
    setDone(false)
    setSidebarOpen(false)
  }, [items.length])

  const advanceToNext = useCallback(() => {
    const nextIdx = items.findIndex(
      (it, i) => i > currentIndex && UNTESTED_STATUSES.has(it.status)
    )
    if (nextIdx >= 0) {
      setCurrentIndex(nextIdx)
    } else {
      const allDone = items.every((it, i) =>
        i === currentIndex || !UNTESTED_STATUSES.has(it.status)
      )
      if (allDone) setDone(true)
    }
  }, [currentIndex, items])

  const handleVerdict = useCallback(
    async (verdict: Verdict) => {
      if (!currentItem) return

      setItems((prev) =>
        prev.map((it) => (it.id === currentItem.id ? { ...it, status: verdict } : it))
      )

      try {
        await fetch(
          `/api/backend/workspaces/${workspaceId}/run-items/${currentItem.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: verdict }),
          }
        )
      } catch {
        // Optimistic state retained
      }

      if (verdict === "fail") {
        setShowDefectPrompt(true)
      } else {
        advanceToNext()
      }
    },
    [currentItem, workspaceId, advanceToNext]
  )

  const handleFileDefect = useCallback(
    async (title: string, description: string) => {
      if (!currentItem) return
      setShowDefectPrompt(false)

      try {
        await fetch(`/api/backend/workspaces/${workspaceId}/defects`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            run_item_id: currentItem.id,
            title,
            description: description || undefined,
          }),
        })
      } catch {
        // Silent
      }

      advanceToNext()
    },
    [currentItem, workspaceId, advanceToNext]
  )

  const handleSkipDefect = useCallback(() => {
    setShowDefectPrompt(false)
    advanceToNext()
  }, [advanceToNext])

  const saveComment = useCallback(() => {
    if (!currentItem) return
    const trimmed = commentValue.trim()

    if (commentSaveTimeout.current) clearTimeout(commentSaveTimeout.current)
    void fetch(
      `/api/backend/workspaces/${workspaceId}/run-items/${currentItem.id}/comment`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: trimmed }),
      }
    ).then(() => setCommentSaved(true))
  }, [currentItem, commentValue, workspaceId])

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCommentValue(e.target.value)
    setCommentSaved(false)
  }

  const handleCommentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation()
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      saveComment()
      ;(e.target as HTMLTextAreaElement).blur()
    }
  }

  const handleStepCommentAdded = useCallback(
    (comment: StepComment, itemId: string) => {
      setStepCommentCache((prev) => ({
        ...prev,
        [itemId]: [...(prev[itemId] ?? []), comment],
      }))
    },
    []
  )

  const goPrev = useCallback(() => navigateTo(currentIndex - 1), [navigateTo, currentIndex])
  const goNext = useCallback(() => navigateTo(currentIndex + 1), [navigateTo, currentIndex])

  useKeyboardExecution({ onVerdict: handleVerdict, onPrev: goPrev, onNext: goNext, enabled: keyboardEnabled })

  const stats = computeStats(items)
  const exitPath = `/app/${slug}/${projectKey}/runs/${runId}`

  // --- Done screen ---
  if (done) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-mist">
        <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm text-center">
          <div className="mb-4 text-4xl">&#10003;</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Run Complete!</h1>
          <p className="text-gray-500 mb-6 text-sm">{runName}</p>

          <div className="mb-6">
            <SegmentedBar
              pass={stats.pass} fail={stats.fail} blocked={stats.blocked}
              skipped={stats.skipped} untested={stats.untested} total={stats.total}
              className="mb-3"
            />
            <div className="flex justify-center gap-4 text-xs text-gray-500">
              <span className="text-pass-text font-medium">{stats.pass} Pass</span>
              <span className="text-fail-text font-medium">{stats.fail} Fail</span>
              <span className="text-blocked-text font-medium">{stats.blocked} Blocked</span>
              <span className="text-skipped-text font-medium">{stats.skipped} Skipped</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3">
            <Button variant="secondary" onClick={() => { setDone(false); setCurrentIndex(0) }}>
              Review Cases
            </Button>
            <Button variant="primary" onClick={() => void router.push(exitPath)}>
              Back to Run
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!currentItem) return null

  const isCaseDeleted = deletedCaseIds.has(currentItem.test_case_id)
  const steps = currentDetail?.steps ?? []
  const stepComments = stepCommentCache[currentItem.id] ?? []
  const isCurrentUntested = UNTESTED_STATUSES.has(currentItem.status)

  return (
    <div className="flex h-screen flex-col bg-mist overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-3">
          {/* Case list toggle */}
          <button
            type="button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            className="flex items-center justify-center w-8 h-8 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors"
            title="Case list"
            aria-label="Toggle case list"
          >
            <Menu size={16} aria-hidden="true" />
          </button>

          <span className="text-sm font-semibold text-gray-900 truncate max-w-xs">{runName}</span>

          {/* Prev / Next navigation */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => navigateTo(currentIndex - 1)}
              disabled={currentIndex === 0}
              className="flex items-center justify-center w-7 h-7 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors"
              title="Previous case"
              aria-label="Previous case"
            >
              <ChevronLeft size={14} aria-hidden="true" />
            </button>
            <span className="text-xs tabular-nums text-gray-500 min-w-[3.5rem] text-center">
              {currentIndex + 1} / {items.length}
            </span>
            <button
              type="button"
              onClick={() => navigateTo(currentIndex + 1)}
              disabled={currentIndex === items.length - 1}
              className="flex items-center justify-center w-7 h-7 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors"
              title="Next case"
              aria-label="Next case"
            >
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex-1 mx-6 max-w-xs">
          <SegmentedBar
            pass={stats.pass} fail={stats.fail} blocked={stats.blocked}
            skipped={stats.skipped} untested={stats.untested} total={stats.total}
            height="compact"
          />
        </div>

        <Button variant="secondary" size="sm" onClick={() => void router.push(exitPath)}>
          Exit
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Case list sidebar */}
        {sidebarOpen && (
          <div className="w-64 shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
            <div className="px-3 py-2 border-b border-gray-100">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Cases ({items.length})
              </span>
            </div>
            <ul>
              {items.map((item, idx) => {
                const isCurrent = idx === currentIndex
                const verdict = VERDICT_MINI[item.status]
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => navigateTo(idx)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                        isCurrent
                          ? "bg-primary/5 text-primary font-medium"
                          : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {verdict ? (
                        <span className={`flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold border ${verdict.className}`}>
                          {verdict.label}
                        </span>
                      ) : (
                        <span className="flex items-center justify-center w-5 h-5 rounded border border-gray-200 text-[10px] text-gray-300">
                          —
                        </span>
                      )}
                      <span className="flex-1 truncate">{item.case_title}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-6 py-8">
            {/* Case header */}
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Test Case {currentIndex + 1}
                </span>
                <StatusBadge status={
                  (["pass","fail","blocked","skipped"].includes(currentItem.status)
                    ? currentItem.status
                    : "untested") as Parameters<typeof StatusBadge>[0]["status"]
                } />
              </div>
              <h1 className="text-xl font-semibold text-gray-900">
                {currentItem.case_title}
              </h1>
              {currentDetail?.preconditions && (
                <div className="mt-3 rounded-md border border-blocked/20 bg-blocked-bg px-4 py-2.5">
                  <p className="text-xs font-medium text-blocked-text mb-0.5">Preconditions</p>
                  <p className="text-sm text-gray-800">{currentDetail.preconditions}</p>
                </div>
              )}
            </div>

            {/* Steps table */}
            {loadingCase && (
              <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-400 mb-4">
                Loading steps…
              </div>
            )}

            {!loadingCase && isCaseDeleted && (
              <div className="rounded-lg border border-gray-200 bg-white p-6 text-center mb-4">
                <p className="text-sm text-gray-500">This test case has been deleted.</p>
                <p className="mt-1 text-xs text-gray-400">Steps are no longer available. You can still record a verdict.</p>
              </div>
            )}

            {!loadingCase && !isCaseDeleted && steps.length > 0 && testFormat === "gwt" && (
              <div className="rounded-lg border border-gray-200 bg-white mb-4 overflow-hidden divide-y divide-gray-50">
                {steps.map((step) => (
                  <div key={step.step_order} className="flex items-start gap-3 px-4 py-3">
                    <span className="shrink-0 w-[60px] rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 text-center mt-0.5">
                      {(step.step_type ?? "given").charAt(0).toUpperCase() + (step.step_type ?? "given").slice(1)}
                    </span>
                    <p className="flex-1 text-sm text-gray-800 whitespace-pre-wrap">
                      {step.action}
                    </p>
                    <div className="shrink-0">
                      {canEdit && (
                        <StepCommentIcon
                          runItemId={currentItem.id}
                          stepOrder={step.step_order}
                          workspaceId={workspaceId}
                          existingComments={stepComments}
                          onCommentAdded={(comment) => handleStepCommentAdded(comment, currentItem.id)}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loadingCase && !isCaseDeleted && steps.length > 0 && testFormat !== "gwt" && (
              <div className="rounded-lg border border-gray-200 bg-white mb-4 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="w-8 px-4 py-2.5 text-left text-xs font-medium text-gray-500">#</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Action</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Expected Result</th>
                      <th className="w-10 px-2 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {steps.map((step) => (
                      <tr key={step.step_order} className="border-b border-gray-50 last:border-0">
                        <td className="w-8 px-4 py-3 text-xs text-gray-400 align-top">
                          {step.step_order}
                        </td>
                        <td className="px-4 py-3 text-gray-800 align-top whitespace-pre-wrap">
                          {step.action}
                        </td>
                        <td className="px-4 py-3 text-gray-600 align-top whitespace-pre-wrap">
                          {step.expected_result}
                        </td>
                        <td className="px-2 py-3 align-top">
                          {canEdit && (
                            <StepCommentIcon
                              runItemId={currentItem.id}
                              stepOrder={step.step_order}
                              workspaceId={workspaceId}
                              existingComments={stepComments}
                              onCommentAdded={(comment) => handleStepCommentAdded(comment, currentItem.id)}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!loadingCase && !isCaseDeleted && steps.length === 0 && currentDetail && (
              <div className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400 mb-4">
                No steps defined for this test case.
              </div>
            )}

            {/* Defect prompt */}
            {canEdit && (
              <DefectPrompt
                isOpen={showDefectPrompt}
                caseTitle={currentItem.case_title}
                onFile={handleFileDefect}
                onSkip={handleSkipDefect}
              />
            )}

            {!canEdit && (
              <div className="rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-500 mb-4">
                You have view-only access to this run.
              </div>
            )}

            {/* Case comment */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-500">Case comment</label>
                <div className="flex items-center gap-2">
                  {!commentSaved && (
                    <span className="text-[10px] text-gray-400">Unsaved</span>
                  )}
                  {commentSaved && commentValue.trim() && (
                    <span className="text-[10px] text-pass-text">Saved</span>
                  )}
                </div>
              </div>
              <textarea
                value={commentValue}
                onChange={handleCommentChange}
                onFocus={() => setCommentFocused(true)}
                onBlur={() => { setCommentFocused(false); if (!commentSaved) saveComment() }}
                onKeyDown={handleCommentKeyDown}
                rows={2}
                placeholder="Add a note about this test case…"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
              {!commentSaved && (
                <div className="flex items-center justify-end gap-2 mt-1.5">
                  <span className="text-[10px] text-gray-400">Ctrl+Enter to save</span>
                  <Button variant="primary" size="sm" onClick={saveComment} disabled={!canEdit}>
                    Save
                  </Button>
                </div>
              )}
            </div>

            {/* Execution history */}
            <ExecutionHistory
              caseId={currentItem.test_case_id}
              workspaceId={workspaceId}
            />
          </div>
        </div>
      </div>

      {/* Keyboard hints footer */}
      <div className="shrink-0 border-t border-gray-200 bg-white px-6 py-2.5">
        <div className="flex items-center justify-center gap-6 text-xs text-gray-400">
          {isCurrentUntested ? (
            <>
              {canEdit && (
                <>
                  <KeyHint k="P" label="Pass" color="text-pass-text" />
                  <KeyHint k="F" label="Fail" color="text-fail-text" />
                  <KeyHint k="B" label="Blocked" color="text-blocked-text" />
                  <KeyHint k="S" label="Skip" color="text-skipped-text" />
                  <span className="text-gray-300">|</span>
                </>
              )}
              <KeyHint k="←" label="Prev" color="text-gray-500" />
              <KeyHint k="→" label="Next" color="text-gray-500" />
            </>
          ) : (
            <>
              <span className="text-gray-500">Already judged — navigate to review</span>
              <span className="text-gray-300">|</span>
              <KeyHint k="←" label="Prev" color="text-gray-500" />
              <KeyHint k="→" label="Next" color="text-gray-500" />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function KeyHint({ k, label, color }: { k: string; label: string; color: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <kbd className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded border border-gray-200 bg-gray-50 px-1 font-mono text-xs font-medium text-gray-600">
        {k}
      </kbd>
      <span className={color}>{label}</span>
    </span>
  )
}
