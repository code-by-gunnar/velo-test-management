import { useEffect } from "react"

export type Verdict = "pass" | "fail" | "blocked" | "skipped"

const KEY_MAP: Record<string, Verdict> = {
  p: "pass",
  P: "pass",
  f: "fail",
  F: "fail",
  b: "blocked",
  B: "blocked",
  s: "skipped",
  S: "skipped",
}

const BLOCKED_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"])

interface UseKeyboardExecutionOptions {
  onVerdict: (verdict: Verdict) => void
  onPrev?: () => void
  onNext?: () => void
  enabled: boolean
}

export function useKeyboardExecution({ onVerdict, onPrev, onNext, enabled }: UseKeyboardExecutionOptions): void {
  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement

      // Guard: skip if focus is in a form element
      if (BLOCKED_TAGS.has(target.tagName)) return
      if (target.isContentEditable) return

      // Arrow key navigation
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        onPrev?.()
        return
      }
      if (e.key === "ArrowRight") {
        e.preventDefault()
        onNext?.()
        return
      }

      const verdict = KEY_MAP[e.key]
      if (!verdict) return

      e.preventDefault()
      onVerdict(verdict)
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [enabled, onVerdict, onPrev, onNext])
}
