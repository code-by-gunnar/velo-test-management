import { describe, it } from "vitest"

// TR-03: Keyboard execution — P/F/B/S shortcuts
describe("useKeyboardExecution", () => {
  it.todo("calls onVerdict with 'pass' when P key is pressed")
  it.todo("calls onVerdict with 'fail' when F key is pressed")
  it.todo("calls onVerdict with 'blocked' when B key is pressed")
  it.todo("calls onVerdict with 'skipped' when S key is pressed")
  it.todo("does NOT fire when focus is on an INPUT element")
  it.todo("does NOT fire when focus is on a TEXTAREA element")
  it.todo("does NOT fire when enabled is false")
  it.todo("calls e.preventDefault() to prevent browser default behavior")
})
