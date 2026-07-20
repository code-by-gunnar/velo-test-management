import { useState } from "react"
import { ChevronDown, ChevronRight, Copy, Check } from "lucide-react"
import { clsx } from "clsx"

interface ApiReferenceProps {
  workspaceId: string
  apiBaseUrl: string
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="shrink-0 rounded p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
      title="Copy"
    >
      {copied ? <Check size={12} className="text-pass-text" /> : <Copy size={12} />}
    </button>
  )
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 p-3">
      <pre className="flex-1 overflow-x-auto whitespace-pre-wrap text-xs font-mono text-gray-800 leading-relaxed">
        {code}
      </pre>
      <CopyBtn text={code} />
    </div>
  )
}

interface MethodBadgeProps {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
}

function MethodBadge({ method }: MethodBadgeProps) {
  const colors: Record<string, string> = {
    GET: "bg-blue-100 text-blue-700",
    POST: "bg-green-100 text-green-700",
    PATCH: "bg-amber-100 text-amber-700",
    PUT: "bg-amber-100 text-amber-700",
    DELETE: "bg-red-100 text-red-700",
  }
  return (
    <span className={clsx("inline-block rounded px-1.5 py-0.5 text-[10px] font-bold font-mono uppercase", colors[method])}>
      {method}
    </span>
  )
}

interface EndpointProps {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
  path: string
  description: string
  curl?: string
  body?: string
}

function Endpoint({ method, path, description, curl, body }: EndpointProps) {
  const [open, setOpen] = useState(false)
  const hasDetails = curl || body

  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        type="button"
        onClick={() => hasDetails && setOpen(!open)}
        className={clsx(
          "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm",
          hasDetails ? "hover:bg-gray-50 cursor-pointer" : "cursor-default"
        )}
      >
        {hasDetails ? (
          open ? <ChevronDown size={12} className="shrink-0 text-gray-400" /> : <ChevronRight size={12} className="shrink-0 text-gray-400" />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <MethodBadge method={method} />
        <code className="text-xs font-mono text-gray-700 truncate">{path}</code>
        <span className="ml-auto shrink-0 text-xs text-gray-400">{description}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 pl-9 flex flex-col gap-2">
          {body && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Body</p>
              <CodeBlock code={body} />
            </div>
          )}
          {curl && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Example</p>
              <CodeBlock code={curl} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface SectionProps {
  title: string
  children: React.ReactNode
}

function Section({ title, children }: SectionProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="border-b border-gray-200 bg-gray-50 px-3 py-2">
        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{title}</h4>
      </div>
      {children}
    </div>
  )
}

export function ApiReference({ workspaceId, apiBaseUrl }: ApiReferenceProps) {
  const wid = workspaceId
  const pid = "{project_id}"

  const curlGet = (path: string): string =>
    `curl -H "Authorization: Bearer YOUR_API_KEY" \\\n  "${apiBaseUrl}${path}"`

  const curlPost = (path: string, body: string): string =>
    `curl -X POST \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${body}' \\\n  "${apiBaseUrl}${path}"`

  const curlPatch = (path: string, body: string): string =>
    `curl -X PATCH \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${body}' \\\n  "${apiBaseUrl}${path}"`

  return (
    <div className="flex flex-col gap-5">
      {/* Auth info */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Authentication</h3>
        <p className="text-sm text-gray-600 mb-3">
          All API requests require an API key sent as a Bearer token. Create keys in the{" "}
          <span className="font-medium text-gray-800">API Keys</span> tab.
        </p>
        <CodeBlock code={`Authorization: Bearer velo_your_api_key_here`} />
        <p className="mt-3 text-sm text-gray-600">
          Base URL: <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono">{apiBaseUrl}/api/v1</code>
        </p>
        <div className="mt-3 rounded-md border border-blue-100 bg-blue-50 px-3 py-2">
          <p className="text-xs text-blue-700">
            <span className="font-semibold">Windows users:</span> Use double quotes around the URL and write curl commands on a single line (no backslash line continuation).
          </p>
        </div>
      </div>

      {/* Projects */}
      <Section title="Projects">
        <Endpoint method="GET" path={`/api/v1/workspaces/${wid}/projects`} description="List projects"
          curl={curlGet(`/api/v1/workspaces/${wid}/projects`)} />
        <Endpoint method="POST" path={`/api/v1/workspaces/${wid}/projects`} description="Create project"
          body={`{"name": "My Project", "project_key": "MP"}`}
          curl={curlPost(`/api/v1/workspaces/${wid}/projects`, '{"name":"My Project","project_key":"MP"}')} />
        <Endpoint method="PATCH" path={`/api/v1/workspaces/${wid}/projects/${pid}`} description="Update project" />
        <Endpoint method="DELETE" path={`/api/v1/workspaces/${wid}/projects/${pid}`} description="Delete project" />
      </Section>

      {/* Suites */}
      <Section title="Suites">
        <Endpoint method="GET" path={`/api/v1/workspaces/${wid}/projects/${pid}/suites`} description="List suites (tree)"
          curl={curlGet(`/api/v1/workspaces/${wid}/projects/${pid}/suites`)} />
        <Endpoint method="POST" path={`/api/v1/workspaces/${wid}/projects/${pid}/suites`} description="Create suite"
          body={`{"name": "Login Tests", "parent_id": null}`}
          curl={curlPost(`/api/v1/workspaces/${wid}/projects/${pid}/suites`, '{"name":"Login Tests"}')} />
        <Endpoint method="PATCH" path={`/api/v1/workspaces/${wid}/projects/${pid}/suites/{suite_id}`} description="Rename suite" />
        <Endpoint method="DELETE" path={`/api/v1/workspaces/${wid}/projects/${pid}/suites/{suite_id}`} description="Delete suite" />
      </Section>

      {/* Test Cases */}
      <Section title="Test Cases">
        <Endpoint method="GET" path={`/api/v1/workspaces/${wid}/projects/${pid}/cases`} description="List cases"
          curl={curlGet(`/api/v1/workspaces/${wid}/projects/${pid}/cases`)} />
        <Endpoint method="GET" path={`/api/v1/workspaces/${wid}/projects/${pid}/cases?suite_id={id}`} description="Filter by suite" />
        <Endpoint method="POST" path={`/api/v1/workspaces/${wid}/projects/${pid}/cases`} description="Create case"
          body={`{"title": "Login works", "priority": "high", "steps": [{"action": "Enter credentials", "expected_result": "Logged in"}]}`}
          curl={curlPost(`/api/v1/workspaces/${wid}/projects/${pid}/cases`, '{"title":"Login works","priority":"high","steps":[{"action":"Enter credentials","expected_result":"Logged in"}]}')} />
        <Endpoint method="GET" path={`/api/v1/workspaces/${wid}/projects/${pid}/cases/{case_id}`} description="Get case detail" />
        <Endpoint method="PUT" path={`/api/v1/workspaces/${wid}/projects/${pid}/cases/{case_id}`} description="Update case + steps" />
        <Endpoint method="DELETE" path={`/api/v1/workspaces/${wid}/projects/${pid}/cases/{case_id}`} description="Soft-delete case" />
      </Section>

      {/* Runs */}
      <Section title="Test Runs">
        <Endpoint method="GET" path={`/api/v1/workspaces/${wid}/runs?project_id=${pid}`} description="List runs"
          curl={curlGet(`/api/v1/workspaces/${wid}/runs?project_id=${pid}`)} />
        <Endpoint method="POST" path={`/api/v1/workspaces/${wid}/runs`} description="Create run"
          body={`{"name": "Sprint 1 Regression", "project_id": "${pid}"}`}
          curl={curlPost(`/api/v1/workspaces/${wid}/runs`, `{"name":"Sprint 1 Regression","project_id":"${pid}"}`)} />
        <Endpoint method="GET" path={`/api/v1/workspaces/${wid}/runs/{run_id}`} description="Get run detail + items" />
        <Endpoint method="PATCH" path={`/api/v1/workspaces/${wid}/runs/{run_id}/abort`} description="Abort run" />
        <Endpoint method="POST" path={`/api/v1/workspaces/${wid}/runs/{run_id}/rerun-failures`} description="Rerun failed items" />
      </Section>

      {/* Run Items */}
      <Section title="Run Items">
        <Endpoint method="PATCH" path={`/api/v1/workspaces/${wid}/run-items/{item_id}`} description="Set verdict"
          body={`{"status": "pass"}`}
          curl={curlPatch(`/api/v1/workspaces/${wid}/run-items/{item_id}`, '{"status":"pass"}')} />
        <Endpoint method="PATCH" path={`/api/v1/workspaces/${wid}/run-items/{item_id}/comment`} description="Set case comment"
          body={`{"comment": "Flaky on CI"}`} />
        <Endpoint method="POST" path={`/api/v1/workspaces/${wid}/run-items/{item_id}/step-comments`} description="Add step comment"
          body={`{"step_order": 1, "comment": "Screenshot attached"}`} />
        <Endpoint method="GET" path={`/api/v1/workspaces/${wid}/run-items/{item_id}/step-comments`} description="List step comments" />
      </Section>

      {/* Defects */}
      <Section title="Defects">
        <Endpoint method="POST" path={`/api/v1/workspaces/${wid}/defects`} description="File defect"
          body={`{"run_item_id": "{item_id}", "title": "Login button broken"}`}
          curl={curlPost(`/api/v1/workspaces/${wid}/defects`, '{"run_item_id":"{item_id}","title":"Login button broken"}')} />
        <Endpoint method="GET" path={`/api/v1/workspaces/${wid}/defects`} description="List defects"
          curl={curlGet(`/api/v1/workspaces/${wid}/defects`)} />
        <Endpoint method="GET" path={`/api/v1/workspaces/${wid}/defects?run_item_id={id}`} description="Filter by run item" />
      </Section>

      {/* Ingestion */}
      <Section title="CI Ingestion">
        <Endpoint method="POST" path={`/api/v1/workspaces/${wid}/projects/${pid}/ingest/junit`} description="Ingest JUnit XML"
          curl={`curl -X POST \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -F "file=@junit-results.xml" \\\n  "${apiBaseUrl}/api/v1/workspaces/${wid}/projects/${pid}/ingest/junit"`} />
        <Endpoint method="POST" path={`/api/v1/workspaces/${wid}/projects/${pid}/ingest/allure`} description="Ingest Allure JSON"
          curl={`curl -X POST \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -F "file=@allure-results.json" \\\n  "${apiBaseUrl}/api/v1/workspaces/${wid}/projects/${pid}/ingest/allure"`} />
      </Section>
    </div>
  )
}
