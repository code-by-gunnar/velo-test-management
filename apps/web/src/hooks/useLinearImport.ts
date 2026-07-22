import { useState, useCallback } from "react"

export interface SuggestedStep {
  action: string
  expected_result?: string
  step_type?: string
}

export interface SuggestedCase {
  title: string
  steps: SuggestedStep[]
}

export interface LinearIssue {
  id: string
  identifier: string
  title: string
  description: string
  url: string
}

type ImportStatus = "idle" | "fetching" | "preview" | "saving" | "done" | "error"

export interface LinearImportState {
  status: ImportStatus
  issue: LinearIssue | null
  suggestedCases: SuggestedCase[]
  error: string | null
  savedCount: number
}

interface UseLinearImportOptions {
  workspaceId: string
  projectId: string
  onSuccess?: (count: number) => void
}

export function useLinearImport({ workspaceId, projectId, onSuccess }: UseLinearImportOptions) {
  const [state, setState] = useState<LinearImportState>({
    status: "idle",
    issue: null,
    suggestedCases: [],
    error: null,
    savedCount: 0,
  })

  const fetchAndParse = useCallback(async (issueId: string) => {
    setState((prev) => ({ ...prev, status: "fetching", error: null }))

    try {
      // 1. Enqueue the import job — the slow Linear+AI work runs server-side so a
      //    slow local model can't time out the request (VEL-61).
      const res = await fetch(
        `/api/backend/workspaces/${workspaceId}/projects/${projectId}/linear-import`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ issue_id: issueId.trim() }),
        }
      )

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? `Server error: ${res.status}`)
      }

      const { job_id: jobId } = await res.json() as { job_id: string }

      // 2. Poll the job until the worker finishes (done/error) or we give up.
      const POLL_INTERVAL_MS = 1500
      const MAX_POLLS = 80 // ~2 min ceiling — comfortably past the 60s AI timeout
      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))

        const pollRes = await fetch(
          `/api/backend/workspaces/${workspaceId}/projects/${projectId}/linear-import/${jobId}`
        )
        if (!pollRes.ok) {
          const data = await pollRes.json().catch(() => ({})) as { error?: string }
          throw new Error(data.error ?? `Server error: ${pollRes.status}`)
        }

        const job = await pollRes.json() as {
          status: "processing" | "done" | "error"
          issue?: LinearIssue
          suggested_cases?: SuggestedCase[]
          parse_failed?: boolean
          error?: string
        }

        if (job.status === "processing") continue

        if (job.status === "error") {
          setState((prev) => ({
            ...prev,
            status: "error",
            issue: job.issue ?? prev.issue,
            error: job.error ?? "Import failed. Please try again.",
          }))
          return
        }

        // status === "done"
        const cases = job.suggested_cases ?? []
        // The model returned structured output we couldn't parse (more common with
        // local LLMs). Show a retry prompt rather than a misleading empty preview.
        if (job.parse_failed && cases.length === 0) {
          setState((prev) => ({
            ...prev,
            status: "error",
            issue: job.issue ?? null,
            error: "The AI response couldn't be parsed. This can happen with local models — please try again.",
          }))
          return
        }

        setState({
          status: "preview",
          issue: job.issue ?? null,
          suggestedCases: cases,
          error: null,
          savedCount: 0,
        })
        return
      }

      throw new Error("The import is taking longer than expected. Please try again.")
    } catch (err) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: err instanceof Error ? err.message : "Failed to fetch issue",
      }))
    }
  }, [workspaceId, projectId])

  const updateCase = useCallback((index: number, updated: SuggestedCase) => {
    setState((prev) => ({
      ...prev,
      suggestedCases: prev.suggestedCases.map((c, i) => (i === index ? updated : c)),
    }))
  }, [])

  const removeCase = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      suggestedCases: prev.suggestedCases.filter((_, i) => i !== index),
    }))
  }, [])

  const saveCases = useCallback(async (suiteId: string | null) => {
    setState((prev) => ({ ...prev, status: "saving", error: null }))

    let savedCount = 0

    try {
      for (const tc of state.suggestedCases) {
        if (!tc.title.trim()) continue

        const body: Record<string, unknown> = {
          title: tc.title,
          priority: "medium",
          steps: tc.steps,
        }
        if (suiteId) body.suite_id = suiteId
        if (state.issue) {
          body.source_url = state.issue.url
          body.source_ref = state.issue.identifier
        }

        const res = await fetch(
          `/api/backend/workspaces/${workspaceId}/projects/${projectId}/cases`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        )

        if (res.ok) savedCount++
      }

      setState((prev) => ({ ...prev, status: "done", savedCount }))
      onSuccess?.(savedCount)
    } catch (err) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: err instanceof Error ? err.message : "Failed to save cases",
      }))
    }
  }, [state.suggestedCases, state.issue, workspaceId, projectId, onSuccess])

  const reset = useCallback(() => {
    setState({
      status: "idle",
      issue: null,
      suggestedCases: [],
      error: null,
      savedCount: 0,
    })
  }, [])

  return { state, fetchAndParse, updateCase, removeCase, saveCases, reset }
}
