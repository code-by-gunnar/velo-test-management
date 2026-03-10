import { describe, it } from "vitest"

// allure-parser module will be implemented in plan 04-02
// import { parseAllureJson } from "../allure-parser.js"

describe("parseAllureJson", () => {
  // IN-02: Allure JSON format support

  it.todo("parses single Allure result object")

  it.todo("parses array of Allure results")

  it.todo("maps passed to pass, failed/broken to fail, skipped/unknown to skipped")

  it.todo("computes duration from start and stop timestamps")

  it.todo("extracts failure message and trace from statusDetails")

  it.todo("returns 400-style error for ZIP content")
})
