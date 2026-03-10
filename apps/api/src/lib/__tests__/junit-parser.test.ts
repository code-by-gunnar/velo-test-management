import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseJUnitXml, NormalizedTestCase } from "../junit-parser.js"

const FIXTURES = join(import.meta.dirname, "../../routes/__tests__/fixtures")

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf-8")
}

describe("parseJUnitXml", () => {
  // IN-03: JUnit XML variant support

  it("parses pytest-junit XML with testsuites root", () => {
    const xml = loadFixture("pytest-report.xml")
    const results = parseJUnitXml(xml)

    expect(results).toHaveLength(3)

    const pass = results.find(r => r.name === "test_successful_login")
    expect(pass).toBeDefined()
    expect(pass!.status).toBe("pass")
    expect(pass!.classname).toBe("tests.test_login.TestLogin")
    expect(pass!.fullName).toBe("tests.test_login.TestLogin.test_successful_login")
    expect(pass!.durationMs).toBe(312)

    const fail = results.find(r => r.name === "test_invalid_password_returns_401")
    expect(fail).toBeDefined()
    expect(fail!.status).toBe("fail")
    expect(fail!.failureMessage).toBe("AssertionError: assert 200 == 401")
    expect(fail!.failureBody).toBeTruthy()

    const skipped = results.find(r => r.name === "test_oauth_login_flow")
    expect(skipped).toBeDefined()
    expect(skipped!.status).toBe("skipped")
  })

  it("parses Maven Surefire XML with testsuite root (no wrapper)", () => {
    const xml = loadFixture("surefire-report.xml")
    const results = parseJUnitXml(xml)

    // 3 non-skipped cases: pass, failure, error, skipped = 4 total
    expect(results).toHaveLength(4)

    const pass = results.find(r => r.name === "testSuccessfulLogin")
    expect(pass).toBeDefined()
    expect(pass!.status).toBe("pass")
    expect(pass!.classname).toBe("com.example.LoginTest")

    // failure element maps to fail
    const failureCase = results.find(r => r.name === "testInvalidCredentials")
    expect(failureCase).toBeDefined()
    expect(failureCase!.status).toBe("fail")
    expect(failureCase!.failureMessage).toBe("Expected status 401 but got 200")

    // error element also maps to fail (Pitfall 3)
    const errorCase = results.find(r => r.name === "testSessionExpiry")
    expect(errorCase).toBeDefined()
    expect(errorCase!.status).toBe("fail")
    expect(errorCase!.failureMessage).toBe("Connection refused: localhost:8080")

    const skipped = results.find(r => r.name === "testOAuthRedirect")
    expect(skipped).toBeDefined()
    expect(skipped!.status).toBe("skipped")
  })

  it("parses Gradle XML with error elements", () => {
    const xml = loadFixture("gradle-report.xml")
    const results = parseJUnitXml(xml)

    expect(results).toHaveLength(4)

    const pass = results.find(r => r.name === "getUserByIdReturnsUser")
    expect(pass).toBeDefined()
    expect(pass!.status).toBe("pass")

    // failure maps to fail
    const failureCase = results.find(r => r.name === "getUserByIdThrowsForUnknownId")
    expect(failureCase).toBeDefined()
    expect(failureCase!.status).toBe("fail")

    // error maps to fail (Pitfall 3)
    const errorCase = results.find(r => r.name === "updateUserEmailSendsVerification")
    expect(errorCase).toBeDefined()
    expect(errorCase!.status).toBe("fail")
    expect(errorCase!.failureMessage).toBe("EmailService unavailable in test environment")

    const skipped = results.find(r => r.name === "deleteUserRemovesFromDatabase")
    expect(skipped).toBeDefined()
    expect(skipped!.status).toBe("skipped")
  })

  it("parses Jest-junit XML with describe-block classnames", () => {
    const xml = loadFixture("jest-junit-report.xml")
    const results = parseJUnitXml(xml)

    expect(results).toHaveLength(3)

    const pass = results.find(r => r.name === "returns JWT token for valid credentials")
    expect(pass).toBeDefined()
    expect(pass!.status).toBe("pass")
    expect(pass!.classname).toBe("AuthService > login")
    expect(pass!.fullName).toBe("AuthService > login.returns JWT token for valid credentials")

    const fail = results.find(r => r.name === "throws UnauthorizedException for wrong password")
    expect(fail).toBeDefined()
    expect(fail!.status).toBe("fail")
    expect(fail!.failureMessage).toBe("Expected mock to have been called with UnauthorizedException")

    const skipped = results.find(r => r.name === "handles OAuth provider callback")
    expect(skipped).toBeDefined()
    expect(skipped!.status).toBe("skipped")
  })

  it("parses Go gotestsum XML with package-path classnames", () => {
    const xml = loadFixture("gotestsum-report.xml")
    const results = parseJUnitXml(xml)

    expect(results).toHaveLength(3)

    const pass = results.find(r => r.name === "TestLogin")
    expect(pass).toBeDefined()
    expect(pass!.status).toBe("pass")
    expect(pass!.classname).toBe("github.com/org/repo/pkg/auth")
    expect(pass!.fullName).toBe("github.com/org/repo/pkg/auth.TestLogin")

    const fail = results.find(r => r.name === "TestLoginInvalidPassword")
    expect(fail).toBeDefined()
    expect(fail!.status).toBe("fail")
    expect(fail!.failureMessage).toBe("got status 200, want 401")

    const skipped = results.find(r => r.name === "TestLoginOAuthFlow")
    expect(skipped).toBeDefined()
    expect(skipped!.status).toBe("skipped")
  })

  it("handles single-testcase suite without array collapse", () => {
    const xml = loadFixture("single-test-junit.xml")
    const results = parseJUnitXml(xml)

    // Must return exactly 1 result — not crash when testcase is an object not array
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe("testOnlyOneTestInSuite")
    expect(results[0].status).toBe("pass")
    expect(results[0].classname).toBe("com.example.SingleTest")
    expect(results[0].fullName).toBe("com.example.SingleTest.testOnlyOneTestInSuite")
    expect(results[0].durationMs).toBe(123)
  })

  it("returns empty array for unrecognized XML", () => {
    const results = parseJUnitXml("<root/>")
    expect(results).toEqual([])
  })

  it("throws on invalid XML", () => {
    expect(() => parseJUnitXml("<invalid")).toThrow("JUnit XML parse error")
  })

  it("normalizes failure and error children to fail status", () => {
    const surefireXml = loadFixture("surefire-report.xml")
    const results = parseJUnitXml(surefireXml)

    // Both <failure> and <error> elements must map to "fail"
    const failureCase = results.find(r => r.name === "testInvalidCredentials")
    const errorCase = results.find(r => r.name === "testSessionExpiry")

    expect(failureCase!.status).toBe("fail")
    expect(errorCase!.status).toBe("fail")
  })

  it("extracts duration in milliseconds from time attribute", () => {
    const xml = loadFixture("pytest-report.xml")
    const results = parseJUnitXml(xml)

    // pytest fixture: first case has time="0.312" => 312ms
    const pass = results.find(r => r.name === "test_successful_login")
    expect(pass!.durationMs).toBe(312)

    // second case has time="0.287" => 287ms
    const fail = results.find(r => r.name === "test_invalid_password_returns_401")
    expect(fail!.durationMs).toBe(287)
  })

  it("returns null durationMs when time attribute is absent", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
  <testsuite name="suite">
    <testcase name="no-time-test"/>
  </testsuite>
</testsuites>`
    const results = parseJUnitXml(xml)
    expect(results).toHaveLength(1)
    expect(results[0].durationMs).toBeNull()
  })

  it("returns null classname when classname attribute is absent", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
  <testsuite name="suite">
    <testcase name="no-classname-test" time="0.1"/>
  </testsuite>
</testsuites>`
    const results = parseJUnitXml(xml)
    expect(results).toHaveLength(1)
    expect(results[0].classname).toBeNull()
    expect(results[0].fullName).toBe("no-classname-test")
    expect(results[0].durationMs).toBe(100)
  })

  it("NormalizedTestCase has all required fields", () => {
    const xml = loadFixture("single-test-junit.xml")
    const results = parseJUnitXml(xml)
    const tc: NormalizedTestCase = results[0]

    expect(tc).toHaveProperty("name")
    expect(tc).toHaveProperty("classname")
    expect(tc).toHaveProperty("fullName")
    expect(tc).toHaveProperty("durationMs")
    expect(tc).toHaveProperty("status")
    expect(tc).toHaveProperty("failureMessage")
    expect(tc).toHaveProperty("failureBody")
  })
})
