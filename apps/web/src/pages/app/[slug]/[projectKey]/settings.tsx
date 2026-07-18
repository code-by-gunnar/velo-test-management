import { useState } from "react"
import type { GetServerSideProps } from "next"
import { useRouter } from "next/router"
import { auth } from "@/auth"
import { resolveProject } from "@/lib/project-cache"
import { AppLayout } from "@/components/layout/app-layout"
import { WebhookSettings } from "@/components/settings/WebhookSettings"
import { Button, Input, FormField } from "@/components/ui"
import { clsx } from "clsx"
import { Trash2 } from "lucide-react"

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20)
}

interface ProjectSettingsProps {
  slug: string
  projectKey: string
  workspaceId: string
  projectId: string
  projectName: string
  projectCount: number
  testFormat: string
}

const TABS = [
  { key: "general", label: "General" },
  { key: "webhooks", label: "Webhooks" },
] as const

type TabKey = (typeof TABS)[number]["key"]

export default function ProjectSettingsPage({
  slug,
  projectKey,
  workspaceId,
  projectId,
  projectName,
  projectCount,
  testFormat,
}: ProjectSettingsProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabKey>("general")
  const [name, setName] = useState(projectName)
  const [key, setKey] = useState(projectKey)
  const [keyEdited, setKeyEdited] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [saveSuccess, setSaveSuccess] = useState(false)

  const hasChanges =
    (name.trim() !== projectName || key !== projectKey) &&
    name.trim().length > 0 &&
    key.length > 0

  function handleNameChange(value: string) {
    setName(value)
    if (!keyEdited) {
      setKey(slugify(value))
    }
    setSaveError("")
    setSaveSuccess(false)
  }

  function handleKeyChange(value: string) {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 20)
    setKey(cleaned)
    setKeyEdited(true)
    setSaveError("")
    setSaveSuccess(false)
  }

  async function handleSave() {
    setSaving(true)
    setSaveError("")
    setSaveSuccess(false)

    const body: Record<string, string> = {}
    if (name.trim() !== projectName) body.name = name.trim()
    if (key !== projectKey) body.project_key = key

    try {
      const res = await fetch(
        `/api/backend/workspaces/${workspaceId}/projects/${projectId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      )
      if (!res.ok) {
        const data = (await res.json()) as { error?: string; field?: string }
        if (res.status === 409 && data.field === "project_key") {
          setSaveError("This project key is already in use")
        } else {
          throw new Error(data.error ?? "Failed to save")
        }
        return
      }

      const updated = (await res.json()) as { project_key: string }

      // Notify sidebar to re-fetch projects
      window.dispatchEvent(new Event("velo:project-updated"))

      // If key changed, navigate to the new URL
      if (updated.project_key !== projectKey) {
        localStorage.setItem("velo:last-project-key", updated.project_key)
        void router.replace(`/app/${slug}/${updated.project_key}/settings`)
      } else {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 2000)
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppLayout slug={slug} projectKey={projectKey}>
      <div className="flex h-full flex-col">
        {/* Page header */}
        <div className="border-b border-gray-200 bg-white px-6 py-4">
          <h1 className="text-lg font-semibold text-gray-900">Project Settings</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Configure project-level settings and integrations
          </p>
        </div>

        {/* Tab navigation */}
        <div className="border-b border-gray-200 bg-white px-6">
          <nav className="flex gap-6" aria-label="Project settings tabs">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={clsx(
                  "relative py-3 text-sm font-medium transition-colors",
                  activeTab === tab.key
                    ? "text-primary"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary rounded-t" />
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className={clsx("mx-auto w-full", activeTab === "webhooks" ? "max-w-5xl" : "max-w-3xl")}>
            {activeTab === "general" && (
              <div className="flex flex-col gap-6">
                {/* Editable project name + read-only IDs */}
                <div className="rounded-lg border border-gray-200 bg-white p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Project</h3>

                  <div className="space-y-4">
                    <FormField label="Project name" htmlFor="project-name">
                      <Input
                        id="project-name"
                        value={name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        maxLength={255}
                        className="max-w-sm"
                      />
                    </FormField>

                    <FormField label="Project key" htmlFor="project-key">
                      <Input
                        id="project-key"
                        value={key}
                        onChange={(e) => handleKeyChange(e.target.value)}
                        maxLength={20}
                        className="max-w-sm font-mono"
                      />
                      <p className="text-xs text-gray-500">
                        Used in URLs and integrations. Lowercase letters, numbers, and hyphens only.
                      </p>
                    </FormField>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Test case format
                      </label>
                      <span className={clsx(
                        "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium",
                        testFormat === "gwt"
                          ? "bg-primary-selected text-primary"
                          : "bg-gray-100 text-gray-700"
                      )}>
                        {testFormat === "gwt" ? "Given-When-Then" : "Traditional Steps"}
                      </span>
                      <p className="mt-1.5 text-xs text-gray-400">
                        Set at project creation and cannot be changed.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => void handleSave()}
                        disabled={!hasChanges || saving}
                      >
                        {saving ? "Saving..." : "Save"}
                      </Button>
                      {saveError && <p className="text-sm text-fail">{saveError}</p>}
                      {saveSuccess && <p className="text-sm text-pass">Saved</p>}
                    </div>

                    {/* Read-only IDs */}
                    <div className="border-t border-gray-100 pt-4">
                      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                        <dt className="text-gray-500">Project ID</dt>
                        <dd>
                          <code className="select-all rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-700">{projectId}</code>
                        </dd>
                        <dt className="text-gray-500">Workspace ID</dt>
                        <dd>
                          <code className="select-all rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-700">{workspaceId}</code>
                        </dd>
                      </dl>
                      <p className="mt-4 text-xs text-gray-400">
                        Use these IDs when calling the REST API or configuring CI ingestion.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Delete project */}
                <ProjectDeleteSection
                  workspaceId={workspaceId}
                  projectId={projectId}
                  slug={slug}
                  projectCount={projectCount}
                />
              </div>
            )}

            {activeTab === "webhooks" && (
              <WebhookSettings workspaceId={workspaceId} projectId={projectId} />
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

function ProjectDeleteSection({
  workspaceId,
  projectId,
  slug,
  projectCount,
}: {
  workspaceId: string
  projectId: string
  slug: string
  projectCount: number
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")

  const isLastProject = projectCount <= 1

  async function handleDelete() {
    setDeleting(true)
    setError("")
    try {
      const res = await fetch(
        `/api/backend/workspaces/${workspaceId}/projects/${projectId}`,
        { method: "DELETE" }
      )
      if (res.status === 204) {
        void router.push(`/app/${slug}`)
        return
      }
      const data = (await res.json()) as { error?: string }
      throw new Error(data.error ?? "Failed to delete project")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete project")
      setDeleting(false)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900">
            Delete this project
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Permanently removes this project and all its test cases, suites, and run history.
          </p>

          {error && (
            <p className="mt-3 text-sm text-fail">{error}</p>
          )}

          {isLastProject ? (
            <p className="mt-3 text-sm text-gray-500">
              You need at least one project in your workspace. Create another project before deleting this one.
            </p>
          ) : confirming ? (
            <div className="mt-4">
              <p className="mb-3 text-sm text-gray-600">
                Are you sure? This cannot be undone.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                >
                  {deleting ? "Deleting..." : "Confirm delete"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirming(false)}
                  disabled={deleting}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirming(true)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete project
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await auth(context)
  if (!session) return { redirect: { destination: "/login", permanent: false } }

  const { slug, projectKey } = context.params as { slug: string; projectKey: string }
  const workspaceId = session.user.workspace_id ?? ""
  const apiUrl = process.env.API_URL ?? ""

  const token =
    context.req.cookies["__Secure-authjs.session-token"] ??
    context.req.cookies["authjs.session-token"] ??
    null

  let projectCount = 0

  // Cached lookup + projects list in parallel (was two sequential fetches)
  const [project, listRes] = await Promise.all([
    resolveProject(workspaceId, projectKey, token ?? undefined),
    workspaceId && token
      ? fetch(`${apiUrl}/api/workspaces/${workspaceId}/projects`, {
          headers: { authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(8_000),
        }).catch(() => null)
      : Promise.resolve(null),
  ])

  if (listRes?.ok) {
    const projects = (await listRes.json()) as Array<{ id: string }>
    projectCount = projects.length
  }

  return {
    props: {
      slug,
      projectKey,
      workspaceId,
      projectId: project?.id ?? "",
      projectName: project?.name ?? "",
      projectCount,
      testFormat: project?.test_format ?? "steps",
    },
  }
}
