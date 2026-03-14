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

      const data = await res.json() as {
        issue: LinearIssue
        suggested_cases: SuggestedCase[]
      }

      setState({
        status: "preview",
        issue: data.issue,
        suggestedCases: data.suggested_cases,
        error: null,
        savedCount: 0,
      })
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
