import { useState, useEffect, useCallback } from "react"
import type { Dispatch, SetStateAction } from "react"

export interface TestCase {
  id: string
  suite_id: string | null
  title: string
  preconditions: string | null
  priority: "critical" | "high" | "medium" | "low"
  position: number
  step_count: number
}

export interface TestCaseStep {
  action: string
  expected_result: string
}

export interface TestCaseDetail extends TestCase {
  steps: TestCaseStep[]
}

interface CreateCaseInput {
  suite_id?: string | null
  title: string
  preconditions?: string
  priority: "critical" | "high" | "medium" | "low"
  steps: TestCaseStep[]
}

interface UpdateCaseInput extends CreateCaseInput {
  id: string
}

interface UseTestCasesReturn {
  cases: TestCase[]
  setCases: Dispatch<SetStateAction<TestCase[]>>
  isLoading: boolean
  error: string | null
  createCase: (input: CreateCaseInput) => Promise<TestCase>
  updateCase: (input: UpdateCaseInput) => Promise<TestCase>
  deleteCase: (id: string) => Promise<void>
  refetch: () => void
}

export function useTestCases(
  workspaceId: string,
  projectId: string,
  selectedSuiteId: string | null
): UseTestCasesReturn {
  const [cases, setCases] = useState<TestCase[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchCases = useCallback(async () => {
    if (!workspaceId || !projectId) return
    setIsLoading(true)
    setError(null)
    try {
      const url = selectedSuiteId
        ? `/api/workspaces/${workspaceId}/projects/${projectId}/cases?suite_id=${selectedSuiteId}`
        : `/api/workspaces/${workspaceId}/projects/${projectId}/cases`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Failed to fetch cases: ${res.status}`)
      const data = await res.json() as TestCase[]
      setCases(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cases")
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId, projectId, selectedSuiteId])

  useEffect(() => {
    void fetchCases()
  }, [fetchCases])

  const createCase = useCallback(async (input: CreateCaseInput): Promise<TestCase> => {
    // Optimistic insert
    const optimisticId = `optimistic-${Date.now()}`
    const optimistic: TestCase = {
      id: optimisticId,
      suite_id: input.suite_id ?? null,
      title: input.title,
      preconditions: input.preconditions ?? null,
      priority: input.priority,
      position: (cases[cases.length - 1]?.position ?? 0) + 1000,
      step_count: input.steps.length,
    }
    setCases((prev) => [...prev, optimistic])

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/projects/${projectId}/cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error(`Failed to create case: ${res.status}`)
      const created = await res.json() as TestCase
      // Replace optimistic entry with real one
      setCases((prev) => prev.map((c) => (c.id === optimisticId ? created : c)))
      return created
    } catch (err) {
      // Rollback optimistic
      setCases((prev) => prev.filter((c) => c.id !== optimisticId))
      throw err
    }
  }, [workspaceId, projectId, cases])

  const updateCase = useCallback(async (input: UpdateCaseInput): Promise<TestCase> => {
    // Optimistic update
    setCases((prev) =>
      prev.map((c) =>
        c.id === input.id
          ? { ...c, title: input.title, priority: input.priority, preconditions: input.preconditions ?? null, step_count: input.steps.length }
          : c
      )
    )

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/projects/${projectId}/cases/${input.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error(`Failed to update case: ${res.status}`)
      const updated = await res.json() as TestCase
      setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
      return updated
    } catch (err) {
      // Refetch to restore correct state
      void fetchCases()
      throw err
    }
  }, [workspaceId, projectId, fetchCases])

  const deleteCase = useCallback(async (id: string): Promise<void> => {
    // Optimistic delete
    const prev = cases
    setCases((current) => current.filter((c) => c.id !== id))

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/projects/${projectId}/cases/${id}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        // Rollback
        setCases(prev)
        throw new Error(`Failed to delete case: ${res.status}`)
      }
    } catch (err) {
      setCases(prev)
      throw err
    }
  }, [workspaceId, projectId, cases])

  return { cases, setCases, isLoading, error, createCase, updateCase, deleteCase, refetch: fetchCases }
}
