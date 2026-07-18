import { useState, useEffect, useCallback, useMemo, useRef } from "react"
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

// Stale-while-revalidate cache (sessionStorage, same pattern as the sidebar's
// project switcher): navigating back to the cases page — or between suites —
// renders the last-known list instantly while a background refetch updates it.
// Keyed per workspace/project/suite so suite switches also hit the cache.
function readCache(key: string): TestCase[] | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as TestCase[]) : null
  } catch {
    return null
  }
}

function writeCache(key: string, data: TestCase[]): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(data))
  } catch {
    // Storage full/unavailable — cache is best-effort
  }
}

export function useTestCases(
  workspaceId: string,
  projectId: string,
  selectedSuiteId: string | null
): UseTestCasesReturn {
  const cacheKey = `velo:cases:${workspaceId}:${projectId}:${selectedSuiteId ?? "all"}`
  // Latest server/local truth for a specific cache key. When the key changes
  // (suite click) this is stale, and the display falls back to the cache.
  const [fetched, setFetched] = useState<{ key: string; data: TestCase[] } | null>(null)
  const [fetchingKey, setFetchingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cacheKeyRef = useRef(cacheKey)
  useEffect(() => {
    cacheKeyRef.current = cacheKey
  }, [cacheKey])

  const cases = useMemo(() => {
    if (fetched?.key === cacheKey) return fetched.data
    return readCache(cacheKey) ?? []
  }, [fetched, cacheKey])

  const hasData = fetched?.key === cacheKey || readCache(cacheKey) !== null
  // Loading only when there is nothing to show — cached data displays
  // immediately while the background refetch runs
  const isLoading = !hasData && fetchingKey === cacheKey

  const fetchCases = useCallback(async () => {
    if (!workspaceId || !projectId) return
    const key = `velo:cases:${workspaceId}:${projectId}:${selectedSuiteId ?? "all"}`
    setFetchingKey(key)
    setError(null)
    try {
      const url = selectedSuiteId
        ? `/api/backend/workspaces/${workspaceId}/projects/${projectId}/cases?suite_id=${selectedSuiteId}`
        : `/api/backend/workspaces/${workspaceId}/projects/${projectId}/cases`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Failed to fetch cases: ${res.status}`)
      const data = await res.json() as TestCase[]
      writeCache(key, data)
      setFetched({ key, data })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cases")
    } finally {
      setFetchingKey((prev) => (prev === key ? null : prev))
    }
  }, [workspaceId, projectId, selectedSuiteId])

  useEffect(() => {
    void fetchCases()
  }, [fetchCases])

  // Drop-in replacement for a plain setState — applies the update to the
  // currently displayed list and persists it to the cache, so optimistic
  // updates (reorder, bulk ops) survive navigation.
  const setCases = useCallback<Dispatch<SetStateAction<TestCase[]>>>((action) => {
    setFetched((prev) => {
      const key = cacheKeyRef.current
      const current = prev?.key === key ? prev.data : readCache(key) ?? []
      const next = typeof action === "function" ? action(current) : action
      writeCache(key, next)
      return { key, data: next }
    })
  }, [])

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
      const res = await fetch(`/api/backend/workspaces/${workspaceId}/projects/${projectId}/cases`, {
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
  }, [workspaceId, projectId, cases, setCases])

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
      const res = await fetch(`/api/backend/workspaces/${workspaceId}/projects/${projectId}/cases/${input.id}`, {
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
  }, [workspaceId, projectId, fetchCases, setCases])

  const deleteCase = useCallback(async (id: string): Promise<void> => {
    // Optimistic delete
    const prev = cases
    setCases((current) => current.filter((c) => c.id !== id))

    try {
      const res = await fetch(`/api/backend/workspaces/${workspaceId}/projects/${projectId}/cases/${id}`, {
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
  }, [workspaceId, projectId, cases, setCases])

  return { cases, setCases, isLoading, error, createCase, updateCase, deleteCase, refetch: fetchCases }
}
