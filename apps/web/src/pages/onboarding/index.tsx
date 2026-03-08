import { useState } from "react"
import { useRouter } from "next/router"
import { useSession } from "next-auth/react"
import type { GetServerSideProps } from "next"
import { auth } from "@/auth"
import { Button, Input, FormField, Card } from "@/components/ui"

type Step = "workspace" | "project" | "sample-data"

interface WizardState {
  workspaceName: string
  workspaceSlug: string
  projectName: string
  projectKey: string
  loadSampleData: boolean
}

export default function OnboardingPage() {
  const router = useRouter()
  const { update } = useSession()
  const [step, setStep] = useState<Step>("workspace")
  const [state, setState] = useState<WizardState>({
    workspaceName: "",
    workspaceSlug: "",
    projectName: "",
    projectKey: "",
    loadSampleData: false,
  })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [workspaceId, setWorkspaceId] = useState("")

  // Auto-generate slug from workspace name
  const handleWorkspaceNameChange = (name: string) => {
    const slug = name.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 63)
    setState((s) => ({ ...s, workspaceName: name, workspaceSlug: slug }))
  }

  // Auto-generate project key from project name
  const handleProjectNameChange = (name: string) => {
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20)
    setState((s) => ({ ...s, projectName: name, projectKey: key }))
  }

  const createWorkspace = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/workspaces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: state.workspaceName, slug: state.workspaceSlug }),
      })
      if (res.status === 409) { setError("That workspace URL is taken. Try a different name."); return }
      if (!res.ok) { setError("Something went wrong. Please try again."); return }
      const ws = await res.json()
      setWorkspaceId(ws.id)

      // Refresh the Auth.js JWT to include the new workspace_id and workspace_slug.
      // Without this, session.user.workspace_id remains null and requireAuth
      // redirects back to /onboarding in an infinite loop.
      // Auth.js v5 jwt callback handles trigger === "update" to merge these fields.
      await update({ workspace_id: ws.id, workspace_slug: ws.slug })

      setStep("project")
    } finally {
      setLoading(false)
    }
  }

  const createProject = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/workspaces/${workspaceId}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: state.projectName, project_key: state.projectKey }),
      })
      if (!res.ok) { setError("Could not create project. Please try again."); return }
      setStep("sample-data")
    } finally {
      setLoading(false)
    }
  }

  const finish = async () => {
    if (state.loadSampleData) {
      // Seed request — backend creates sample suites/test cases
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/workspaces/${workspaceId}/seed`, {
        method: "POST",
        credentials: "include",
      })
    }
    router.push(`/app/${state.workspaceSlug}`)
  }

  const STEPS: Step[] = ["workspace", "project", "sample-data"]

  return (
    <div className="flex min-h-screen items-center justify-center bg-mist p-4">
      <Card className="w-full max-w-md">
        {/* Step indicator */}
        <div className="mb-6 flex gap-2">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${step === s || i < STEPS.indexOf(step) ? "bg-cobalt" : "bg-gray-200"}`}
            />
          ))}
        </div>

        {step === "workspace" && (
          <>
            <h1 className="mb-1 text-lg font-semibold">Name your workspace</h1>
            <p className="mb-6 text-sm text-gray-500">This is usually your company name.</p>
            <div className="flex flex-col gap-4">
              <FormField label="Workspace name" htmlFor="ws-name" error={error}>
                <Input
                  id="ws-name"
                  placeholder="Acme Corp"
                  value={state.workspaceName}
                  onChange={(e) => handleWorkspaceNameChange(e.target.value)}
                  autoFocus
                />
              </FormField>
              <FormField label="Workspace URL" htmlFor="ws-slug">
                <div className="flex items-center gap-1">
                  <span className="text-sm text-gray-400">velo.app/app/</span>
                  <Input
                    id="ws-slug"
                    value={state.workspaceSlug}
                    onChange={(e) => setState((s) => ({ ...s, workspaceSlug: e.target.value }))}
                    className="flex-1"
                    placeholder="acme-corp"
                  />
                </div>
                <p className="text-xs text-gray-400">You can change this once after creation.</p>
              </FormField>
              <Button onClick={createWorkspace} disabled={!state.workspaceName || loading}>
                {loading ? "Creating..." : "Continue"}
              </Button>
            </div>
          </>
        )}

        {step === "project" && (
          <>
            <h1 className="mb-1 text-lg font-semibold">Create your first project</h1>
            <p className="mb-6 text-sm text-gray-500">A project groups your test suites and runs.</p>
            <div className="flex flex-col gap-4">
              <FormField label="Project name" htmlFor="proj-name" error={error}>
                <Input
                  id="proj-name"
                  placeholder="My App"
                  value={state.projectName}
                  onChange={(e) => handleProjectNameChange(e.target.value)}
                  autoFocus
                />
              </FormField>
              <FormField label="Project key" htmlFor="proj-key">
                <Input
                  id="proj-key"
                  value={state.projectKey}
                  onChange={(e) => setState((s) => ({ ...s, projectKey: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,"") }))}
                  placeholder="myapp"
                  maxLength={20}
                />
                <p className="text-xs text-gray-400">Lowercase letters and numbers only. Cannot be changed.</p>
              </FormField>
              <Button onClick={createProject} disabled={!state.projectName || !state.projectKey || loading}>
                {loading ? "Creating..." : "Continue"}
              </Button>
            </div>
          </>
        )}

        {step === "sample-data" && (
          <>
            <h1 className="mb-1 text-lg font-semibold">{"You're almost ready"}</h1>
            <p className="mb-6 text-sm text-gray-500">Want to start with sample test suites and cases?</p>
            <div className="flex flex-col gap-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={state.loadSampleData}
                  onChange={(e) => setState((s) => ({ ...s, loadSampleData: e.target.checked }))}
                />
                <div>
                  <p className="text-sm font-medium">Load sample data</p>
                  <p className="text-xs text-gray-500">Pre-populates your project with example test suites and cases. Fully editable.</p>
                </div>
              </label>
              <Button onClick={finish} disabled={loading}>
                {loading ? "Setting up..." : "Go to dashboard"}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

// Redirect to dashboard if user already has a workspace
export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await auth(context)
  if (!session) {
    return { redirect: { destination: "/login", permanent: false } }
  }
  if (session.user.workspace_slug) {
    // Already onboarded — workspace_slug is stored in JWT so we can redirect directly
    return { redirect: { destination: `/app/${session.user.workspace_slug}`, permanent: false } }
  }
  return { props: {} }
}
