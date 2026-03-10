import React, { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/router"
import { useKeyboardExecution } from "@/hooks/useKeyboardExecution"
import type { Verdict } from "@/hooks/useKeyboardExecution"
import { DefectPrompt } from "./DefectPrompt"
import { StepCommentIcon } from "./StepCommentIcon"
import type { StepComment } from "./StepCommentIcon"
import { ExecutionHistory } from "./ExecutionHistory"
import { StatusBadge } from "@/components/ui/status-badge"
import { SegmentedBar } from "./SegmentedBar"
import { Button } from "@/components/ui/button"

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
  items: RunItem[]
  slug: string
  projectKey: string
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

export function ExecutionScreen({
  runId,
  runName,
  workspaceId,
  projectId,
  items: initialItems,
  slug,
  projectKey,
}: ExecutionScreenProps) {
  const router = useRouter()

  const [items, setItems] = useState<RunItem[]>(initialItems)
  const [currentIndex, setCurrentIndex] = useState(() => findFirstUntested(initialItems))
  const [showDefectPrompt, setShowDefectPrompt] = useState(false)
  const [caseDetailCache, setCaseDetailCache] = useState<Record<string, CaseDetail>>({})
  const [stepCommentCache, setStepCommentCache] = useState<Record<string, StepComment[]>>({})
  const [loadingCase, setLoadingCase] = useState(false)
  const [done, setDone] = useState(false)
  const [commentValue, setCommentValue] = useState("")
  const commentSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [commentFocused, setCommentFocused] = useState(false)

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
        if (!res.ok) throw new Error(`Failed to fetch case: ${res.status}`)
        return res.json() as Promise<CaseDetail>
      })
      .then((detail) => {
        setCaseDetailCache((prev) => ({ ...prev, [caseId]: detail }))
      })
      .catch(() => {
        // Continue without steps — still functional
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

  // Also sync comment textarea with current item's stored comment
  useEffect(() => {
    setCommentValue(currentItem?.comment ?? "")
  }, [currentIndex, currentItem])

  const advanceToNext = useCallback(() => {
    const nextIdx = items.findIndex(
      (it, i) => i > currentIndex && UNTESTED_STATUSES.has(it.status)
    )
    if (nextIdx >= 0) {
      setCurrentIndex(nextIdx)
    } else {
      // Check if all items are now tested
      setItems((prev) => {
        const allDone = prev.every((it) => !UNTESTED_STATUSES.has(it.status))
        if (allDone) setDone(true)
        return prev
      })
      setDone(true)
    }
  }, [currentIndex, items])

  const handleVerdict = useCallback(
    async (verdict: Verdict) => {
      if (!currentItem) return

      // Optimistic update
      setItems((prev) =>
        prev.map((it) => (it.id === currentItem.id ? { ...it, status: verdict } : it))
      )

      // PATCH verdict to API
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
        // Optimistic state retained — execution continues
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
        // Defect filing failed silently — execution still advances
      }

      advanceToNext()
    },
    [currentItem, workspaceId, advanceToNext]
  )

  const handleSkipDefect = useCallback(() => {
    setShowDefectPrompt(false)
    advanceToNext()
  }, [advanceToNext])

  const handleCommentBlur = () => {
    setCommentFocused(false)
    if (!currentItem) return
    const trimmed = commentValue.trim()

    if (commentSaveTimeout.current) clearTimeout(commentSaveTimeout.current)
    commentSaveTimeout.current = setTimeout(() => {
      void fetch(
        `/api/backend/workspaces/${workspaceId}/run-items/${currentItem.id}/comment`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comment: trimmed }),
        }
      )
    }, 300)
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

  useKeyboardExecution({ onVerdict: handleVerdict, enabled: keyboardEnabled })

  const stats = computeStats(items)
  const progressLabel = `${currentIndex + 1} of ${items.length}`

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
              pass={stats.pass}
              fail={stats.fail}
              blocked={stats.blocked}
              skipped={stats.skipped}
              untested={stats.untested}
              total={stats.total}
              className="mb-3"
            />
            <div className="flex justify-center gap-4 text-xs text-gray-500">
              <span className="text-pass-text font-medium">{stats.pass} Pass</span>
              <span className="text-fail-text font-medium">{stats.fail} Fail</span>
              <span className="text-blocked-text font-medium">{stats.blocked} Blocked</span>
              <span className="text-skipped-text font-medium">{stats.skipped} Skipped</span>
            </div>
          </div>

          <Button
            variant="primary"
            onClick={() => void router.push(exitPath)}
          >
            Back to Run
          </Button>
        </div>
      </div>
    )
  }

  if (!currentItem) return null

  const steps = currentDetail?.steps ?? []
  const stepComments = stepCommentCache[currentItem.id] ?? []

  return (
    <div className="flex h-screen flex-col bg-mist overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3 shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-gray-900 truncate max-w-xs">{runName}</span>
          <span className="text-xs text-gray-400">{progressLabel}</span>
        </div>

        <div className="flex-1 mx-8 max-w-xs">
          <SegmentedBar
            pass={stats.pass}
            fail={stats.fail}
            blocked={stats.blocked}
            skipped={stats.skipped}
            untested={stats.untested}
            total={stats.total}
            height="compact"
          />
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => void router.push(exitPath)}
        >
          Exit
        </Button>
      </div>

      {/* Main content — scrollable */}
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
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5">
                <p className="text-xs font-medium text-amber-800 mb-0.5">Preconditions</p>
                <p className="text-sm text-amber-900">{currentDetail.preconditions}</p>
              </div>
            )}
          </div>

          {/* Steps table */}
          {loadingCase && (
            <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-400 mb-4">
              Loading steps…
            </div>
          )}

          {!loadingCase && steps.length > 0 && (
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
                        <StepCommentIcon
                          runItemId={currentItem.id}
                          stepOrder={step.step_order}
                          workspaceId={workspaceId}
                          existingComments={stepComments}
                          onCommentAdded={(comment) => handleStepCommentAdded(comment, currentItem.id)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loadingCase && steps.length === 0 && currentDetail && (
            <div className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400 mb-4">
              No steps defined for this test case.
            </div>
          )}

          {/* Defect prompt — appears after fail verdict */}
          <DefectPrompt
            isOpen={showDefectPrompt}
            caseTitle={currentItem.case_title}
            onFile={handleFileDefect}
            onSkip={handleSkipDefect}
          />

          {/* Case comment */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Case comment
            </label>
            <textarea
              value={commentValue}
              onChange={(e) => setCommentValue(e.target.value)}
              onFocus={() => setCommentFocused(true)}
              onBlur={handleCommentBlur}
              rows={3}
              placeholder="Add a note about this test case…"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-cobalt focus:outline-none focus:ring-1 focus:ring-cobalt resize-none"
            />
          </div>

          {/* Execution history panel */}
          <ExecutionHistory
            caseId={currentItem.test_case_id}
            workspaceId={workspaceId}
          />
        </div>
      </div>

      {/* Keyboard hints footer */}
      <div className="shrink-0 border-t border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center justify-center gap-6 text-xs text-gray-400">
          <KeyHint k="P" label="Pass" color="text-pass-text" />
          <KeyHint k="F" label="Fail" color="text-fail-text" />
          <KeyHint k="B" label="Blocked" color="text-blocked-text" />
          <KeyHint k="S" label="Skip" color="text-skipped-text" />
          <span className="text-gray-300">|</span>
          <span className="text-gray-400">Shortcuts disabled while typing</span>
        </div>
      </div>
    </div>
  )
}

function KeyHint({ k, label, color }: { k: string; label: string; color: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <kbd className="inline-flex h-5 w-5 items-center justify-center rounded border border-gray-200 bg-gray-50 font-mono text-xs font-medium text-gray-600">
        {k}
      </kbd>
      <span className={color}>{label}</span>
    </span>
  )
}
