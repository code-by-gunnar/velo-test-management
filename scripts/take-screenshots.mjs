/**
 * Capture product screenshots for the features page.
 * Run: node scripts/take-screenshots.mjs
 *
 * Prerequisites:
 * - Local dev running (pnpm dev)
 * - Playwright chromium installed (npx playwright install chromium)
 * - Test account: gunnar.finkeldeh+1@gmail.com / Password1234!
 * - Workspace: velo-demo with both Traditional Demo + Velo Demo (GWT) projects populated
 */

import { chromium } from "playwright"

const BASE = "http://localhost:3000"
const EMAIL = "gunnar.finkeldeh+1@gmail.com"
const PASSWORD = "Password1234!"
const OUTPUT = "apps/web/public/screenshots"
const VIEWPORT = { width: 1440, height: 900 }

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: VIEWPORT })
  const page = await context.newPage()

  // Login
  console.log("Logging in...")
  await page.goto(`${BASE}/login`)
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL("**/app/**", { timeout: 15000 })
  console.log("Logged in")

  // Wait for sidebar to load
  await page.waitForTimeout(2000)

  // 1. Test Cases — Traditional (switch to traditional-demo project)
  console.log("1. Traditional test cases...")
  await page.goto(`${BASE}/app/velo-demo/traditional-demo/cases`)
  await page.waitForTimeout(2000)
  // Click first case to open panel
  const firstCase = page.locator("tr[role='row']").first()
  if (await firstCase.isVisible()) {
    await firstCase.click()
    await page.waitForTimeout(1000)
  }
  await page.screenshot({ path: `${OUTPUT}/test-cases-traditional.png`, fullPage: false })
  console.log("  ✓ test-cases-traditional.png")

  // 2. Test Cases — GWT (switch to velodemo project)
  console.log("2. GWT test cases...")
  await page.goto(`${BASE}/app/velo-demo/velodemo/cases`)
  await page.waitForTimeout(2000)
  const firstGwtCase = page.locator("tr[role='row']").first()
  if (await firstGwtCase.isVisible()) {
    await firstGwtCase.click()
    await page.waitForTimeout(1000)
  }
  await page.screenshot({ path: `${OUTPUT}/test-cases-gwt.png`, fullPage: false })
  console.log("  ✓ test-cases-gwt.png")

  // Close panel by pressing Escape
  await page.keyboard.press("Escape")
  await page.waitForTimeout(500)

  // 3. Test Runs page
  console.log("3. Test runs...")
  await page.goto(`${BASE}/app/velo-demo/velodemo/runs`)
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUTPUT}/test-runs.png`, fullPage: false })
  console.log("  ✓ test-runs.png")

  // 4. Execution screen (if a run exists, click into it)
  const runRow = page.locator("a[href*='/runs/']").first()
  if (await runRow.isVisible()) {
    console.log("4. Execution screen...")
    await runRow.click()
    await page.waitForTimeout(2000)

    // Click Resume/Start Execution if available
    const execBtn = page.locator("text=Resume Execution, text=Start Execution").first()
    if (await execBtn.isVisible()) {
      await execBtn.click()
      await page.waitForTimeout(2000)
      await page.screenshot({ path: `${OUTPUT}/execution-screen.png`, fullPage: false })
      console.log("  ✓ execution-screen.png")
    } else {
      // Take the run detail page instead
      await page.screenshot({ path: `${OUTPUT}/run-detail.png`, fullPage: false })
      console.log("  ✓ run-detail.png")
    }
  }

  // 5. Reports
  console.log("5. Reports...")
  await page.goto(`${BASE}/app/velo-demo/velodemo/reports`)
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUTPUT}/reports.png`, fullPage: false })
  console.log("  ✓ reports.png")

  // 6. Project Settings — Linear integration
  console.log("6. Settings...")
  await page.goto(`${BASE}/app/velo-demo/settings?tab=integrations`)
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUTPUT}/settings-integrations.png`, fullPage: false })
  console.log("  ✓ settings-integrations.png")

  await browser.close()
  console.log("\nAll screenshots saved to", OUTPUT)
}

main().catch((err) => {
  console.error("Screenshot script failed:", err)
  process.exit(1)
})
