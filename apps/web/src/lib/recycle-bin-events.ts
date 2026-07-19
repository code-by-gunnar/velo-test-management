// Single source of truth for the recycle-bin change signal. Any surface that
// moves an item into or out of the bin (delete, restore, purge, Undo) dispatches
// this so listeners — the sidebar count badge (useRecycleBinCount) and the
// Recycle Bin page — re-fetch. Cross-component coordination via a window event,
// matching the app's existing `velo:project-updated` convention.
export const RECYCLE_BIN_CHANGED_EVENT = "velo:recycle-bin-changed"

export function notifyRecycleBinChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(RECYCLE_BIN_CHANGED_EVENT))
  }
}
