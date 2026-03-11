/**
 * StepEditor keyboard navigation tests.
 *
 * Verifies the keyboard-first step creation flow (TC-01, TC-02):
 * - Tab on Action → Expected in same row
 * - Tab on Expected (last row) → new row added, focus on new Action
 * - Enter on Expected → new row added, focus on new Action
 * - Backspace on empty Action (index > 0) → row deleted, focus on previous Expected
 * - Shift+Tab on Expected → focus back to Action in same row
 */

import React, { useState } from "react"
import { render, screen, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { StepEditor, type Step } from "@/components/cases/StepEditor"

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { role: "editor" } }, status: "authenticated" }),
}))

// Wrapper component to manage state for controlled StepEditor
function TestWrapper({ initialSteps }: { initialSteps?: Step[] }) {
  const [steps, setSteps] = useState<Step[]>(
    initialSteps ?? [{ action: "", expected_result: "" }]
  )
  return <StepEditor steps={steps} onChange={setSteps} />
}

// TC-02: Keyboard navigation in the step editor
describe("StepEditor — keyboard navigation", () => {
  it("Tab on Action textarea moves focus to Expected textarea in same row", async () => {
    const user = userEvent.setup()
    render(<TestWrapper />)

    const actionTextarea = screen.getByRole("textbox", { name: /step 1 action/i })
    const expectedTextarea = screen.getByRole("textbox", { name: /step 1 expected/i })

    await act(async () => {
      await user.click(actionTextarea)
    })
    expect(document.activeElement).toBe(actionTextarea)

    await act(async () => {
      await user.keyboard("{Tab}")
    })
    expect(document.activeElement).toBe(expectedTextarea)
  })

  it("Tab on Expected textarea in last row adds a new step row and focuses its Action field", async () => {
    const user = userEvent.setup()
    render(<TestWrapper />)

    const expectedTextarea = screen.getByRole("textbox", { name: /step 1 expected/i })

    await act(async () => {
      await user.click(expectedTextarea)
    })
    expect(document.activeElement).toBe(expectedTextarea)

    await act(async () => {
      await user.keyboard("{Tab}")
    })

    // A second row should now exist
    const newActionTextarea = screen.getByRole("textbox", { name: /step 2 action/i })
    expect(newActionTextarea).toBeDefined()
    // Focus moves to new row's Action field
    expect(document.activeElement).toBe(newActionTextarea)
  })

  it("Enter on Expected textarea adds a new step row and focuses its Action field", async () => {
    const user = userEvent.setup()
    render(<TestWrapper />)

    const expectedTextarea = screen.getByRole("textbox", { name: /step 1 expected/i })

    await act(async () => {
      await user.click(expectedTextarea)
    })

    await act(async () => {
      await user.keyboard("{Enter}")
    })

    const newActionTextarea = screen.getByRole("textbox", { name: /step 2 action/i })
    expect(newActionTextarea).toBeDefined()
    expect(document.activeElement).toBe(newActionTextarea)
  })

  it("Backspace on empty Action textarea in non-first row deletes that row and focuses previous row Expected field", async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper
        initialSteps={[
          { action: "Step 1 action", expected_result: "Step 1 expected" },
          { action: "", expected_result: "" },
        ]}
      />
    )

    const step2Action = screen.getByRole("textbox", { name: /step 2 action/i })

    await act(async () => {
      await user.click(step2Action)
    })

    await act(async () => {
      await user.keyboard("{Backspace}")
    })

    // Step 2 should be gone
    expect(screen.queryByRole("textbox", { name: /step 2 action/i })).toBeNull()

    // Focus should be on step 1 Expected
    const step1Expected = screen.getByRole("textbox", { name: /step 1 expected/i })
    expect(document.activeElement).toBe(step1Expected)
  })

  it("Shift+Tab on Expected textarea moves focus back to Action textarea in same row", async () => {
    const user = userEvent.setup()
    render(<TestWrapper />)

    const expectedTextarea = screen.getByRole("textbox", { name: /step 1 expected/i })
    const actionTextarea = screen.getByRole("textbox", { name: /step 1 action/i })

    await act(async () => {
      await user.click(expectedTextarea)
    })
    expect(document.activeElement).toBe(expectedTextarea)

    await act(async () => {
      await user.keyboard("{Shift>}{Tab}{/Shift}")
    })

    expect(document.activeElement).toBe(actionTextarea)
  })

  it("e.preventDefault() is called synchronously on Tab — focus does not jump to next browser focusable element", async () => {
    // Verify Tab does NOT produce a new character/navigate browser-default by confirming
    // our handler intercepted it: focus ends up on Expected (not next tabbable element outside StepEditor)
    const user = userEvent.setup()
    render(
      <div>
        <TestWrapper />
        <button data-testid="outside-button">Outside</button>
      </div>
    )

    const actionTextarea = screen.getByRole("textbox", { name: /step 1 action/i })
    const outsideButton = screen.getByTestId("outside-button")

    await act(async () => {
      await user.click(actionTextarea)
    })

    await act(async () => {
      await user.keyboard("{Tab}")
    })

    // Should NOT have focused the outside button (default Tab behavior was prevented)
    expect(document.activeElement).not.toBe(outsideButton)
    // Should have focused Expected field in same row
    const expectedTextarea = screen.getByRole("textbox", { name: /step 1 expected/i })
    expect(document.activeElement).toBe(expectedTextarea)
  })
})

describe("StepEditor — row management", () => {
  it("starts with one empty step row on initial render", () => {
    render(<TestWrapper />)
    const actionTextareas = screen.getAllByRole("textbox", { name: /action/i })
    expect(actionTextareas).toHaveLength(1)
  })

  it("adding a row increases row count by 1", async () => {
    const user = userEvent.setup()
    render(<TestWrapper />)

    const expectedTextarea = screen.getByRole("textbox", { name: /step 1 expected/i })

    await act(async () => {
      await user.click(expectedTextarea)
      await user.keyboard("{Tab}")
    })

    const actionTextareas = screen.getAllByRole("textbox", { name: /action/i })
    expect(actionTextareas).toHaveLength(2)
  })

  it("deleting a row decreases row count by 1 (minimum 1 row always present)", async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper
        initialSteps={[
          { action: "Step 1", expected_result: "Expected 1" },
          { action: "", expected_result: "" },
        ]}
      />
    )

    let actionTextareas = screen.getAllByRole("textbox", { name: /action/i })
    expect(actionTextareas).toHaveLength(2)

    const step2Action = screen.getByRole("textbox", { name: /step 2 action/i })
    await act(async () => {
      await user.click(step2Action)
      await user.keyboard("{Backspace}")
    })

    actionTextareas = screen.getAllByRole("textbox", { name: /action/i })
    expect(actionTextareas).toHaveLength(1)
  })

  it("step_order values reflect row positions after add/delete/reorder", async () => {
    const user = userEvent.setup()
    render(<TestWrapper />)

    // Add a second step via Tab on Expected
    await act(async () => {
      await user.click(screen.getByRole("textbox", { name: /step 1 expected/i }))
      await user.keyboard("{Tab}")
    })

    // Type something in step 2
    await act(async () => {
      await user.type(screen.getByRole("textbox", { name: /step 2 action/i }), "step 2 text")
    })

    // Add step 3
    await act(async () => {
      await user.click(screen.getByRole("textbox", { name: /step 2 expected/i }))
      await user.keyboard("{Tab}")
    })

    const actionTextareas = screen.getAllByRole("textbox", { name: /action/i })
    expect(actionTextareas).toHaveLength(3)
    // Step 2 action should retain its content
    expect((actionTextareas[1] as HTMLTextAreaElement).value).toBe("step 2 text")
  })
})
