// Single source of truth for the recycle-bin change signal. Any surface that
// moves an item into or out of the bin (delete, restore, purge, Undo) dispatches
// this so listeners — the sidebar count badge (useRecycleBinCount) and the
// Recycle Bin page — re-fetch. Cross-component coordination via a window event,
// matching the app's existing `velo:project-updated` convention.
export const RECYCLE_BIN_CHANGED_EVENT = "velo:recycle-bin-changed"

// Prefix of the per-project SWR snapshot the Recycle Bin page renders from.
// Note the trailing colon: it deliberately does NOT match the count cache
// (`velo:recycle-bin-count:*`), which is refreshed by its own listener.
const BIN_LIST_CACHE_PREFIX = "velo:recycle-bin:"

export function notifyRecycleBinChanged(): void {
  if (typeof window === "undefined") return

  // Drop the cached bin snapshot so the next visit fetches fresh instead of
  // flashing a stale list that predates this change (e.g. a just-deleted item
  // missing from the previous snapshot).
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i)
      if (k?.startsWith(BIN_LIST_CACHE_PREFIX)) sessionStorage.removeItem(k)
    }
  } catch {
    // Storage unavailable — best-effort.
  }

  window.dispatchEvent(new Event(RECYCLE_BIN_CHANGED_EVENT))
}
