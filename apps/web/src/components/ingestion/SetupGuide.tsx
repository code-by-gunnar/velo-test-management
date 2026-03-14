import { useState } from "react"
import { Card, CardHeader, CardTitle } from "@/components/ui"
import Link from "next/link"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001"

interface SetupGuideProps {
  workspaceId: string
  projectId: string
  slug: string
  hasApiKeys: boolean
}

interface CopyButtonProps {
  text: string
}

function CopyButton({ text }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API unavailable
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="shrink-0 rounded border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  )
}

interface CurlBlockProps {
  label: string
  command: string
}

function CurlBlock({ label, command }: CurlBlockProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <div className="flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 p-3">
        <pre className="flex-1 overflow-x-auto whitespace-pre-wrap text-xs font-mono text-gray-800 leading-relaxed">
          {command}
        </pre>
        <CopyButton text={command} />
      </div>
    </div>
  )
}

export function SetupGuide({ workspaceId, projectId, slug, hasApiKeys }: SetupGuideProps) {
  const junitCmd = [
    `curl -X POST ${API_BASE}/api/workspaces/${workspaceId}/projects/${projectId}/ingest/junit \\`,
    `  -H "Authorization: Bearer YOUR_API_KEY" \\`,
    `  -F "file=@junit-results.xml"`,
  ].join("\n")

  const allureMultipartCmd = [
    `curl -X POST ${API_BASE}/api/workspaces/${workspaceId}/projects/${projectId}/ingest/allure \\`,
    `  -H "Authorization: Bearer YOUR_API_KEY" \\`,
    `  -F "file=@allure-results.json"`,
  ].join("\n")

  const allureJsonCmd = [
    `curl -X POST ${API_BASE}/api/workspaces/${workspaceId}/projects/${projectId}/ingest/allure \\`,
    `  -H "Authorization: Bearer YOUR_API_KEY" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  --data-binary @allure-results.json`,
  ].join("\n")

  return (
    <Card>
      <CardHeader>
        <CardTitle>CI Pipeline Setup</CardTitle>
      </CardHeader>

      {!hasApiKeys && (
        <div className="mb-4 rounded-md border border-blocked/20 bg-blocked-bg px-3 py-2.5">
          <p className="text-sm text-blocked-text">
            You need an API key to authenticate CI requests.{" "}
            <Link href={`/app/${slug}/settings`} className="font-semibold underline hover:text-gray-900">
              Create one in Settings
            </Link>
            .
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <p className="text-sm text-gray-600">
          Push test results from your CI pipeline using the REST API. Replace{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs">YOUR_API_KEY</code>{" "}
          with a key from workspace settings.
        </p>

        <div>
          <h4 className="mb-2 text-sm font-semibold text-gray-800">JUnit XML (pytest, Maven, Gradle, Jest, Go)</h4>
          <div className="flex flex-col gap-2">
            <CurlBlock label="Multipart upload" command={junitCmd} />
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold text-gray-800">Allure JSON</h4>
          <div className="flex flex-col gap-2">
            <CurlBlock label="Multipart upload" command={allureMultipartCmd} />
            <CurlBlock label="JSON body" command={allureJsonCmd} />
          </div>
        </div>

        <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
          <p className="text-xs font-semibold text-gray-500 mb-1">Response example</p>
          <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap">
            {`{"run_id":"<uuid>","total_tests":42,"matched_tests":38,"unmatched_count":4,"status":"success"}`}
          </pre>
        </div>
      </div>
    </Card>
  )
}
