/**
 * CasePanel save-feedback tests (P1a).
 *
 * Saving a case is the highest-stakes action on this surface. A failed save
 * must NOT silently close the modal (that reads as success = data loss); it
 * must keep the editor open and surface an error. A successful save should
 * confirm with a toast. These tests pin both paths.
 */

import { render, screen, act, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ToastProvider } from "@/components/ui/toast"
import { CasePanel } from "@/components/cases/CasePanel"

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { role: "editor" } }, status: "authenticated" }),
}))

function renderPanel(onClose = vi.fn(), onSaved = vi.fn()) {
  render(
    <ToastProvider>
      <CasePanel
        isOpen
        caseId={null}
        workspaceId="ws1"
        projectId="proj1"
        testFormat="steps"
        selectedSuiteId={null}
        onClose={onClose}
        onSaved={onSaved}
      />
    </ToastProvider>
  )
  return { onClose, onSaved }
}

async function fillTitleAndSave() {
  const user = userEvent.setup()
  await act(async () => {
    await user.type(screen.getByLabelText(/title/i), "My case")
  })
  await act(async () => {
    await user.click(screen.getByRole("button", { name: /^save$/i }))
  })
}

describe("CasePanel — save feedback", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("failed save keeps the modal open and shows an error toast", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 }) as Response))
    const { onClose, onSaved } = renderPanel()

    await fillTitleAndSave()

    await waitFor(() => {
      expect(screen.getByText(/could ?n['’]?t save|failed to save|couldn't save/i)).toBeDefined()
    })
    expect(onClose).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it("network error keeps the modal open and shows an error toast", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down") }))
    const { onClose } = renderPanel()

    await fillTitleAndSave()

    await waitFor(() => {
      expect(screen.getByText(/couldn['’]?t save/i)).toBeDefined()
    })
    expect(onClose).not.toHaveBeenCalled()
  })

  it("successful save closes the modal and confirms with a toast", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 }) as Response))
    const { onClose, onSaved } = renderPanel()

    await fillTitleAndSave()

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled()
    })
    expect(onClose).toHaveBeenCalled()
    expect(screen.getByText(/case (created|saved)/i)).toBeDefined()
  })
})

describe("CasePanel — load feedback (existing case)", () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it("a failed load shows an error toast and closes the modal instead of leaving it blank", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 }) as Response))
    const onClose = vi.fn()
    render(
      <ToastProvider>
        <CasePanel
          isOpen
          caseId="c1"
          workspaceId="ws1"
          projectId="proj1"
          testFormat="steps"
          selectedSuiteId={null}
          onClose={onClose}
          onSaved={vi.fn()}
        />
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText(/couldn['’]?t load/i)).toBeDefined()
    })
    expect(onClose).toHaveBeenCalled()
  })
})
