import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook } from "@testing-library/react"
import { useKeyboardExecution } from "../useKeyboardExecution"
import type { Verdict } from "../useKeyboardExecution"

function fireKeydown(key: string, target: EventTarget = document) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true })
  Object.defineProperty(event, "target", { value: target, writable: false })
  document.dispatchEvent(event)
}

// TR-03: Keyboard execution — P/F/B/S shortcuts
describe("useKeyboardExecution", () => {
  let onVerdict: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onVerdict = vi.fn()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("calls onVerdict with 'pass' when P key is pressed", () => {
    renderHook(() => useKeyboardExecution({ onVerdict, enabled: true }))
    fireKeydown("p")
    expect(onVerdict).toHaveBeenCalledWith("pass")
  })

  it("calls onVerdict with 'pass' when uppercase P key is pressed", () => {
    renderHook(() => useKeyboardExecution({ onVerdict, enabled: true }))
    fireKeydown("P")
    expect(onVerdict).toHaveBeenCalledWith("pass")
  })

  it("calls onVerdict with 'fail' when F key is pressed", () => {
    renderHook(() => useKeyboardExecution({ onVerdict, enabled: true }))
    fireKeydown("f")
    expect(onVerdict).toHaveBeenCalledWith("fail")
  })

  it("calls onVerdict with 'blocked' when B key is pressed", () => {
    renderHook(() => useKeyboardExecution({ onVerdict, enabled: true }))
    fireKeydown("b")
    expect(onVerdict).toHaveBeenCalledWith("blocked")
  })

  it("calls onVerdict with 'skipped' when S key is pressed", () => {
    renderHook(() => useKeyboardExecution({ onVerdict, enabled: true }))
    fireKeydown("s")
    expect(onVerdict).toHaveBeenCalledWith("skipped")
  })

  it("does NOT fire when focus is on an INPUT element", () => {
    renderHook(() => useKeyboardExecution({ onVerdict, enabled: true }))
    const input = document.createElement("input")
    // Simulate dispatching event from input target
    const event = new KeyboardEvent("keydown", { key: "p", bubbles: true })
    Object.defineProperty(event, "target", { value: input, writable: false })
    document.dispatchEvent(event)
    expect(onVerdict).not.toHaveBeenCalled()
  })

  it("does NOT fire when focus is on a TEXTAREA element", () => {
    renderHook(() => useKeyboardExecution({ onVerdict, enabled: true }))
    const textarea = document.createElement("textarea")
    const event = new KeyboardEvent("keydown", { key: "p", bubbles: true })
    Object.defineProperty(event, "target", { value: textarea, writable: false })
    document.dispatchEvent(event)
    expect(onVerdict).not.toHaveBeenCalled()
  })

  it("does NOT fire when enabled is false", () => {
    renderHook(() => useKeyboardExecution({ onVerdict, enabled: false }))
    fireKeydown("p")
    expect(onVerdict).not.toHaveBeenCalled()
  })

  it("calls e.preventDefault() to prevent browser default behavior", () => {
    renderHook(() => useKeyboardExecution({ onVerdict, enabled: true }))
    const event = new KeyboardEvent("keydown", { key: "p", bubbles: true, cancelable: true })
    const preventDefaultSpy = vi.spyOn(event, "preventDefault")
    document.dispatchEvent(event)
    expect(preventDefaultSpy).toHaveBeenCalled()
  })

  it("removes event listener on unmount", () => {
    const removeEventListenerSpy = vi.spyOn(document, "removeEventListener")
    const { unmount } = renderHook(() => useKeyboardExecution({ onVerdict, enabled: true }))
    unmount()
    expect(removeEventListenerSpy).toHaveBeenCalledWith("keydown", expect.any(Function))
    removeEventListenerSpy.mockRestore()
  })

  it("does not fire for unmapped keys", () => {
    renderHook(() => useKeyboardExecution({ onVerdict, enabled: true }))
    fireKeydown("x")
    fireKeydown("Enter")
    expect(onVerdict).not.toHaveBeenCalled()
  })

  it("fires with correct verdict type", () => {
    renderHook(() => useKeyboardExecution({ onVerdict, enabled: true }))
    const verdicts: Verdict[] = []
    const captureVerdict = vi.fn((v: Verdict) => verdicts.push(v))
    renderHook(() => useKeyboardExecution({ onVerdict: captureVerdict, enabled: true }))
    fireKeydown("p")
    fireKeydown("f")
    fireKeydown("b")
    fireKeydown("s")
    expect(captureVerdict).toHaveBeenNthCalledWith(1, "pass")
    expect(captureVerdict).toHaveBeenNthCalledWith(2, "fail")
    expect(captureVerdict).toHaveBeenNthCalledWith(3, "blocked")
    expect(captureVerdict).toHaveBeenNthCalledWith(4, "skipped")
  })
})
