// Run once: npx tsx create-xlsx-fixture.ts
import ExcelJS from "exceljs"
import { fileURLToPath } from "url"
import path from "path"

const wb = new ExcelJS.Workbook()
const ws = wb.addWorksheet("Test Cases")
ws.addRow(["Title", "Preconditions", "Priority", "Action", "Expected Result"])
ws.addRow(["Login test", "User exists", "high", "Go to /login", "Login page shown"])
ws.addRow(["Login test", "User exists", "high", "Enter credentials", "Form accepts input"])
ws.addRow(["Login test", "User exists", "high", "Click Sign In", "Redirect to dashboard"])

const __dirname = path.dirname(fileURLToPath(import.meta.url))
await wb.xlsx.writeFile(path.join(__dirname, "import-sample.xlsx"))
console.log("Written import-sample.xlsx")
