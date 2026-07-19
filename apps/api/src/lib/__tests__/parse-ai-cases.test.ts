import { describe, it, expect } from "vitest"
import { parseAiTestCases } from "../parse-ai-cases.js"

// The AI providers are prompted to return a bare JSON array of test cases.
// Frontier models (Claude/OpenAI) comply reliably; smaller local models
// (Ollama qwen2.5) intermittently wrap it in fences, add prose, or emit a
// trailing comma. This parser is the single place that turns raw model text
// into cases + a signal for "the model tried but we couldn't parse it".

const CLEAN = `[
  {"title":"Login works","steps":[{"action":"go to /login","expected_result":"form shown"}]},
  {"title":"Login fails","steps":[{"action":"enter bad password","expected_result":"error shown"}]}
]`

describe("parseAiTestCases", () => {
  it("parses a clean bare JSON array", () => {
    const r = parseAiTestCases(CLEAN)
    expect(r.parseFailed).toBe(false)
    expect(r.cases).toHaveLength(2)
    expect(r.cases[0]!.title).toBe("Login works")
    expect(r.cases[0]!.steps[0]!.action).toBe("go to /login")
  })

  it("strips markdown code fences", () => {
    const r = parseAiTestCases("```json\n" + CLEAN + "\n```")
    expect(r.parseFailed).toBe(false)
    expect(r.cases).toHaveLength(2)
  })

  it("tolerates a trailing comma before the closing bracket", () => {
    const withComma = `[
      {"title":"A","steps":[{"action":"x","expected_result":"y"}]},
    ]`
    const r = parseAiTestCases(withComma)
    expect(r.parseFailed).toBe(false)
    expect(r.cases).toHaveLength(1)
  })

  it("extracts the array when the model adds a prose preamble", () => {
    const r = parseAiTestCases("Here are the test cases you asked for:\n\n" + CLEAN)
    expect(r.parseFailed).toBe(false)
    expect(r.cases).toHaveLength(2)
  })

  it("unwraps an object that carries the array under a property", () => {
    const wrapped = `{"test_cases": ${CLEAN}}`
    const r = parseAiTestCases(wrapped)
    expect(r.parseFailed).toBe(false)
    expect(r.cases).toHaveLength(2)
  })

  it("flags parseFailed when an array was attempted but is unterminated", () => {
    const truncated = `[{"title":"A","steps":[{"action":"x","expected_result":`
    const r = parseAiTestCases(truncated)
    expect(r.parseFailed).toBe(true)
    expect(r.cases).toHaveLength(0)
  })

  it("treats an empty array as a legitimate empty result, not a failure", () => {
    const r = parseAiTestCases("[]")
    expect(r.parseFailed).toBe(false)
    expect(r.cases).toHaveLength(0)
  })

  it("treats prose with no array as a legitimate empty result", () => {
    const r = parseAiTestCases("No testable criteria were found in this spec.")
    expect(r.parseFailed).toBe(false)
    expect(r.cases).toHaveLength(0)
  })

  it("returns empty (not failed) for empty or whitespace-only text", () => {
    expect(parseAiTestCases("")).toEqual({ cases: [], parseFailed: false })
    expect(parseAiTestCases("   \n  ")).toEqual({ cases: [], parseFailed: false })
  })

  it("drops entries missing a valid title or steps array", () => {
    const mixed = `[
      {"title":"Valid","steps":[{"action":"do","expected_result":"done"}]},
      {"foo":"bar"},
      {"title":"","steps":[]},
      {"title":"No steps key"}
    ]`
    const r = parseAiTestCases(mixed)
    expect(r.parseFailed).toBe(false)
    expect(r.cases).toHaveLength(1)
    expect(r.cases[0]!.title).toBe("Valid")
  })

  it("drops steps that lack a string action but keeps the case", () => {
    const r = parseAiTestCases(
      `[{"title":"T","steps":[{"action":"real","expected_result":"ok"},{"expected_result":"orphan"}]}]`
    )
    expect(r.cases).toHaveLength(1)
    expect(r.cases[0]!.steps).toHaveLength(1)
    expect(r.cases[0]!.steps[0]!.action).toBe("real")
  })

  it("preserves gwt step_type when present", () => {
    const gwt = `[{"title":"G","steps":[{"step_type":"given","action":"a precondition"}]}]`
    const r = parseAiTestCases(gwt)
    expect(r.cases[0]!.steps[0]!.step_type).toBe("given")
    expect(r.cases[0]!.steps[0]!.action).toBe("a precondition")
  })
})
