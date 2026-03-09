import { describe, it, expect } from "vitest"

// TC-02: Keyboard navigation in the step editor
// StepEditor is the component containing StepRow[] with Tab/Enter/Backspace handling.
// These tests run in jsdom (configured in apps/web/vitest.config.ts).
describe("StepEditor — keyboard navigation", () => {
  it.todo("Tab on Action textarea moves focus to Expected textarea in same row")
  it.todo("Tab on Expected textarea in last row adds a new step row and focuses its Action field")
  it.todo("Enter on Expected textarea adds a new step row and focuses its Action field")
  it.todo("Backspace on empty Action textarea in non-first row deletes that row and focuses previous row Expected field")
  it.todo("Shift+Tab on Expected textarea moves focus back to Action textarea in same row")
  it.todo("e.preventDefault() is called synchronously on Tab — focus does not jump to next browser focusable element")
})

describe("StepEditor — row management", () => {
  it.todo("starts with one empty step row on initial render")
  it.todo("adding a row increases row count by 1")
  it.todo("deleting a row decreases row count by 1 (minimum 1 row always present)")
  it.todo("step_order values reflect row positions after add/delete/reorder")
})
