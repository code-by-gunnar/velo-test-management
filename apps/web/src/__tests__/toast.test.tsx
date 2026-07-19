/**
 * Toast politeness (a11y).
 *
 * A success toast firing `role="alert"` interrupts a screen reader mid-sentence.
 * Only errors/warnings should be assertive; success/info should be polite
 * (`role="status"`, which maps to aria-live="polite").
 */

import { render, screen, act } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { ToastProvider, useToast, type ToastType } from "@/components/ui/toast"

function Emitter({ type, message }: { type: ToastType; message: string }) {
  const { toast } = useToast()
  return <button onClick={() => toast(type, message)}>emit</button>
}

function emit(type: ToastType, message: string) {
  render(
    <ToastProvider>
      <Emitter type={type} message={message} />
    </ToastProvider>
  )
  act(() => {
    screen.getByText("emit").click()
  })
}

describe("Toast — politeness", () => {
  it("error toasts are assertive (role=alert)", () => {
    emit("error", "Something failed")
    const el = screen.getByText("Something failed").closest("[role]")
    expect(el?.getAttribute("role")).toBe("alert")
  })

  it("success toasts are polite (role=status, not alert)", () => {
    emit("success", "Saved")
    const el = screen.getByText("Saved").closest("[role]")
    expect(el?.getAttribute("role")).toBe("status")
  })
})
