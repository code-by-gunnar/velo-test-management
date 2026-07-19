import { useState, useEffect, useCallback, useMemo } from "react"

export interface Suite {
  id: string
  parent_id: string | null
  name: string
  description: string | null
  position: number
  depth: number
  children: Suite[]
}

interface UseSuiteTreeReturn {
  tree: Suite[]
  flatList: Suite[]
  selected: string | null
  setSelected: (id: string | null) => void
  isLoading: boolean
  error: string | null
  refetch: () => void
}

type FlatSuite = Omit<Suite, "children">

function buildTree(suites: FlatSuite[]): Suite[] {
  const map = new Map<string, Suite>()
  const roots: Suite[] = []

  // First pass: create all nodes
  for (const s of suites) {
    map.set(s.id, { ...s, children: [] })
  }

  // Second pass: attach children to parents
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      const parent = map.get(node.parent_id)!
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  // Sort by position at each level
  const sortByPosition = (nodes: Suite[]) => {
    nodes.sort((a, b) => a.position - b.position)
    for (const node of nodes) {
      sortByPosition(node.children)
    }
  }
  sortByPosition(roots)

  return roots
}

export function useSuiteTree(workspaceId: string, projectId: string): UseSuiteTreeReturn {
  const cacheKey = `velo:suites:${workspaceId}:${projectId}`
  // Stale-while-revalidate (same pattern as the sidebar project switcher):
  // render the cached tree instantly, refresh in the background
  const [flatData, setFlatData] = useState<FlatSuite[] | null>(() => {
    if (typeof window === "undefined") return null
    try {
      const raw = sessionStorage.getItem(cacheKey)
      return raw ? (JSON.parse(raw) as FlatSuite[]) : null
    } catch {
      return null
    }
  })
  const [selected, setSelected] = useState<string | null>(null)
  const [isFetching, setIsFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSuites = useCallback(async () => {
    if (!workspaceId || !projectId) return
    setIsFetching(true)
    setError(null)
    try {
      const res = await fetch(`/api/backend/workspaces/${workspaceId}/projects/${projectId}/suites`)
      if (!res.ok) throw new Error(`Failed to fetch suites: ${res.status}`)
      const data = await res.json() as FlatSuite[]
      try { sessionStorage.setItem(cacheKey, JSON.stringify(data)) } catch { /* best-effort */ }
      setFlatData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load suites")
    } finally {
      setIsFetching(false)
    }
  }, [workspaceId, projectId, cacheKey])

  useEffect(() => {
    void fetchSuites()
  }, [fetchSuites])

  const flatList = useMemo<Suite[]>(
    () => (flatData ?? []).map((s) => ({ ...s, children: [] })),
    [flatData]
  )
  const tree = useMemo(() => buildTree(flatData ?? []), [flatData])
  // Loading only when there is nothing cached to show
  const isLoading = flatData === null && isFetching

  return { tree, flatList, selected, setSelected, isLoading, error, refetch: fetchSuites }
}
