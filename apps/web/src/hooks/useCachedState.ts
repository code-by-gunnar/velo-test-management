import { useState, useCallback } from "react"
import type { Dispatch, SetStateAction } from "react"

// Persisted useState following the app's stale-while-revalidate pattern
// (sidebar project switcher, useTestCases, useSuiteTree): the cached value
// renders immediately on mount, callers refresh it in the background, and
// every update writes through to sessionStorage so the next visit is instant.
//
// Returns [value, setValue, hadCache] — hadCache is true when the initial
// render found a cached value, so loading spinners only show on a truly cold
// view. The key must be stable for the lifetime of the component (all call
// sites remount per page navigation, so workspace/project-scoped keys are
// stable in practice).
//
// Known trade-off (shared with the existing cache pattern): on hard reloads
// the server renders the initial value while the client renders the cached
// one, logging a React hydration warning. React recovers automatically.
export function useCachedState<T>(
  key: string,
  initial: T
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [state, setState] = useState<{ value: T; hadCache: boolean }>(() => {
    if (typeof window === "undefined") return { value: initial, hadCache: false }
    try {
      const raw = sessionStorage.getItem(key)
      if (raw === null) return { value: initial, hadCache: false }
      return { value: JSON.parse(raw) as T, hadCache: true }
    } catch {
      return { value: initial, hadCache: false }
    }
  })

  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    (action) => {
      setState((prev) => {
        const next =
          typeof action === "function" ? (action as (p: T) => T)(prev.value) : action
        try {
          sessionStorage.setItem(key, JSON.stringify(next))
        } catch {
          // Storage full/unavailable — cache is best-effort
        }
        return { ...prev, value: next }
      })
    },
    [key]
  )

  return [state.value, setValue, state.hadCache]
}

// Drop every velo:* cache entry. Must run before sign-out so a different
// account signing in on the same tab never sees the previous user's data.
export function clearVeloCache(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i)
      if (k?.startsWith("velo:")) sessionStorage.removeItem(k)
    }
  } catch {
    // Storage unavailable — nothing to clear
  }
}
