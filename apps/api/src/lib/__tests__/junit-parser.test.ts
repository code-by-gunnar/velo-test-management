import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseJUnitXml, type NormalizedTestCase } from "../junit-parser.js"

const FIXTURES = join(import.meta.dirname, "../../routes/__tests__/fixtures")

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf-8")
}

function findCase(results: NormalizedTestCase[], name: string): NormalizedTestCase {
  const found = results.find(r => r.name === name)
  if (!found) throw new Error(`Test case not found: ${name}`)
  return found
}

describe("parseJUnitXml", () => {
  // IN-03: JUnit XML variant support

  it("parses pytest-junit XML with testsuites root", () => {
    const xml = loadFixture("pytest-report.xml")
    const results = parseJUnitXml(xml)

    expect(results).toHaveLength(3)

    const pass = findCase(results, "test_successful_login")
    expect(pass.status).toBe("pass")
    expect(pass.classname).toBe("tests.test_login.TestLogin")
    expect(pass.fullName).toBe("tests.test_login.TestLogin.test_successful_login")
    expect(pass.durationMs).toBe(312)

    const fail = findCase(results, "test_invalid_password_returns_401")
    expect(fail.status).toBe("fail")
    expect(fail.failureMessage).toBe("AssertionError: assert 200 == 401")
    expect(fail.failureBody).toBeTruthy()

    const skipped = findCase(results, "test_oauth_login_flow")
    expect(skipped.status).toBe("skipped")
  })

  it("parses Maven Surefire XML with testsuite root (no wrapper)", () => {
    const xml = loadFixture("surefire-report.xml")
    const results = parseJUnitXml(xml)

    // 3 non-skipped cases: pass, failure, error, skipped = 4 total
    expect(results).toHaveLength(4)

    const pass = findCase(results, "testSuccessfulLogin")
    expect(pass.status).toBe("pass")
    expect(pass.classname).toBe("com.example.LoginTest")

    // failure element maps to fail
    const failureCase = findCase(results, "testInvalidCredentials")
    expect(failureCase.status).toBe("fail")
    expect(failureCase.failureMessage).toBe("Expected status 401 but got 200")

    // error element also maps to fail (Pitfall 3)
    const errorCase = findCase(results, "testSessionExpiry")
    expect(errorCase.status).toBe("fail")
    expect(errorCase.failureMessage).toBe("Connection refused: localhost:8080")

    const skipped = findCase(results, "testOAuthRedirect")
    expect(skipped.status).toBe("skipped")
  })

  it("parses Gradle XML with error elements", () => {
    const xml = loadFixture("gradle-report.xml")
    const results = parseJUnitXml(xml)

    expect(results).toHaveLength(4)

    const pass = findCase(results, "getUserByIdReturnsUser")
    expect(pass.status).toBe("pass")

    // failure maps to fail
    const failureCase = findCase(results, "getUserByIdThrowsForUnknownId")
    expect(failureCase.status).toBe("fail")

    // error maps to fail (Pitfall 3)
    const errorCase = findCase(results, "updateUserEmailSendsVerification")
    expect(errorCase.status).toBe("fail")
    expect(errorCase.failureMessage).toBe("EmailService unavailable in test environment")

    const skipped = findCase(results, "deleteUserRemovesFromDatabase")
    expect(skipped.status).toBe("skipped")
  })

  it("parses Jest-junit XML with describe-block classnames", () => {
    const xml = loadFixture("jest-junit-report.xml")
    const results = parseJUnitXml(xml)

    expect(results).toHaveLength(3)

    const pass = findCase(results, "returns JWT token for valid credentials")
    expect(pass.status).toBe("pass")
    expect(pass.classname).toBe("AuthService > login")
    expect(pass.fullName).toBe("AuthService > login.returns JWT token for valid credentials")

    const fail = findCase(results, "throws UnauthorizedException for wrong password")
    expect(fail.status).toBe("fail")
    expect(fail.failureMessage).toBe("Expected mock to have been called with UnauthorizedException")

    const skipped = findCase(results, "handles OAuth provider callback")
    expect(skipped.status).toBe("skipped")
  })

  it("parses Go gotestsum XML with package-path classnames", () => {
    const xml = loadFixture("gotestsum-report.xml")
    const results = parseJUnitXml(xml)

    expect(results).toHaveLength(3)

    const pass = findCase(results, "TestLogin")
    expect(pass.status).toBe("pass")
    expect(pass.classname).toBe("github.com/org/repo/pkg/auth")
    expect(pass.fullName).toBe("github.com/org/repo/pkg/auth.TestLogin")

    const fail = findCase(results, "TestLoginInvalidPassword")
    expect(fail.status).toBe("fail")
    expect(fail.failureMessage).toBe("got status 200, want 401")

    const skipped = findCase(results, "TestLoginOAuthFlow")
    expect(skipped.status).toBe("skipped")
  })

  it("handles single-testcase suite without array collapse", () => {
    const xml = loadFixture("single-test-junit.xml")
    const results = parseJUnitXml(xml)

    // Must return exactly 1 result — not crash when testcase is an object not array
    expect(results).toHaveLength(1)
    const tc = results[0] as NormalizedTestCase
    expect(tc.name).toBe("testOnlyOneTestInSuite")
    expect(tc.status).toBe("pass")
    expect(tc.classname).toBe("com.example.SingleTest")
    expect(tc.fullName).toBe("com.example.SingleTest.testOnlyOneTestInSuite")
    expect(tc.durationMs).toBe(123)
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
    const failureCase = findCase(results, "testInvalidCredentials")
    const errorCase = findCase(results, "testSessionExpiry")

    expect(failureCase.status).toBe("fail")
    expect(errorCase.status).toBe("fail")
  })

  it("extracts duration in milliseconds from time attribute", () => {
    const xml = loadFixture("pytest-report.xml")
    const results = parseJUnitXml(xml)

    // pytest fixture: first case has time="0.312" => 312ms
    const pass = findCase(results, "test_successful_login")
    expect(pass.durationMs).toBe(312)

    // second case has time="0.287" => 287ms
    const fail = findCase(results, "test_invalid_password_returns_401")
    expect(fail.durationMs).toBe(287)
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
    const tc = results[0] as NormalizedTestCase
    expect(tc.durationMs).toBeNull()
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
    const tc = results[0] as NormalizedTestCase
    expect(tc.classname).toBeNull()
    expect(tc.fullName).toBe("no-classname-test")
    expect(tc.durationMs).toBe(100)
  })

  it("does not expand internal XML entities (billion-laughs DoS guard)", () => {
    // Entity-expansion bomb: with entity processing enabled, &lol5; expands to
    // 10^5 characters from a tiny payload. A real bomb nests ~10 deep (gigabytes).
    // The parser MUST leave entity references literal — never expand them.
    const bomb = `<?xml version="1.0"?>
<!DOCTYPE lolz [
  <!ENTITY lol "lol">
  <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
  <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
  <!ENTITY lol4 "&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;">
  <!ENTITY lol5 "&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;">
]>
<testsuites>
  <testsuite name="bomb">
    <testcase name="&lol5;" classname="c"/>
  </testsuite>
</testsuites>`
    const results = parseJUnitXml(bomb)
    expect(results).toHaveLength(1)
    const tc = results[0] as NormalizedTestCase
    // Entity left literal — not expanded to the 100k-char blow-up.
    expect(tc.name).toBe("&lol5;")
    expect(tc.name.length).toBeLessThan(100)
  })

  it("still decodes the 5 predefined XML entities (guard: do NOT set processEntities:false)", () => {
    // fast-xml-parser already ignores DTD <!ENTITY> declarations (see billion-laughs
    // test above), so disabling processEntities buys no security — it would only
    // corrupt legitimate names/messages that use &amp;/&lt;/&gt; into literal text.
    const xml = `<?xml version="1.0"?>
<testsuites>
  <testsuite name="s">
    <testcase name="a &amp; b &lt; c" classname="c"/>
  </testsuite>
</testsuites>`
    const results = parseJUnitXml(xml)
    expect(results).toHaveLength(1)
    expect((results[0] as NormalizedTestCase).name).toBe("a & b < c")
  })

  it("NormalizedTestCase has all required fields", () => {
    const xml = loadFixture("single-test-junit.xml")
    const results = parseJUnitXml(xml)
    const tc = results[0] as NormalizedTestCase

    expect(tc).toHaveProperty("name")
    expect(tc).toHaveProperty("classname")
    expect(tc).toHaveProperty("fullName")
    expect(tc).toHaveProperty("durationMs")
    expect(tc).toHaveProperty("status")
    expect(tc).toHaveProperty("failureMessage")
    expect(tc).toHaveProperty("failureBody")
  })
})
