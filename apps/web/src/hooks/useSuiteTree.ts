import { useState, useEffect, useCallback } from "react"

export interface Suite {
  id: string
  parent_id: string | null
  name: string
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

function buildTree(suites: Omit<Suite, "children">[]): Suite[] {
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
  const [flatList, setFlatList] = useState<Suite[]>([])
  const [tree, setTree] = useState<Suite[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSuites = useCallback(async () => {
    if (!workspaceId || !projectId) return
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/backend/workspaces/${workspaceId}/projects/${projectId}/suites`)
      if (!res.ok) throw new Error(`Failed to fetch suites: ${res.status}`)
      const data = await res.json() as Omit<Suite, "children">[]
      setFlatList(data.map((s) => ({ ...s, children: [] })))
      setTree(buildTree(data))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load suites")
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId, projectId])

  useEffect(() => {
    void fetchSuites()
  }, [fetchSuites])

  return { tree, flatList, selected, setSelected, isLoading, error, refetch: fetchSuites }
}
