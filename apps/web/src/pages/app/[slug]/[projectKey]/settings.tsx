import { useState } from "react"
import type { GetServerSideProps } from "next"
import { auth } from "@/auth"
import { AppLayout } from "@/components/layout/app-layout"
import { WebhookSettings } from "@/components/settings/WebhookSettings"
import { clsx } from "clsx"

interface ProjectSettingsProps {
  slug: string
  projectKey: string
  workspaceId: string
  projectId: string
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
}: ProjectSettingsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("general")

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
                    ? "text-cobalt"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-cobalt rounded-t" />
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto w-full max-w-3xl">
            {activeTab === "general" && (
              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Project</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-gray-500">Project key</dt>
                  <dd className="font-mono text-gray-900 uppercase">{projectKey}</dd>
                </dl>
                <p className="mt-4 text-xs text-gray-400">
                  Additional project settings will appear here.
                </p>
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

  let projectId = ""

  if (workspaceId && token) {
    try {
      const projectsRes = await fetch(
        `${apiUrl}/api/workspaces/${workspaceId}/projects`,
        { headers: { authorization: `Bearer ${token}` } }
      )
      if (projectsRes.ok) {
        const projects = await projectsRes.json() as Array<{ id: string; project_key: string }>
        const project = projects.find((p) => p.project_key === projectKey)
        projectId = project?.id ?? ""
      }
    } catch {
      // projectId stays empty
    }
  }

  return {
    props: {
      slug,
      projectKey,
      workspaceId,
      projectId,
    },
  }
}
