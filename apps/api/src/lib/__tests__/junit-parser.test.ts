import { describe, it } from "vitest"

// junit-parser module will be implemented in plan 04-02
// import { parseJUnitXml } from "../junit-parser.js"

describe("parseJUnitXml", () => {
  // IN-03: JUnit XML variant support

  it.todo("parses pytest-junit XML with testsuites root")

  it.todo("parses Maven Surefire XML with testsuite root (no wrapper)")

  it.todo("parses Gradle XML with error elements")

  it.todo("parses Jest-junit XML with describe-block classnames")

  it.todo("parses Go gotestsum XML with package-path classnames")

  it.todo("handles single-testcase suite without array collapse")

  it.todo("returns empty array for unrecognized XML")

  it.todo("throws on invalid XML")

  it.todo("normalizes failure and error children to fail status")

  it.todo("extracts duration in milliseconds from time attribute")
})
