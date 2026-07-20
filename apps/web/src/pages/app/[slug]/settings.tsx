import { useState } from "react"
import type { GetServerSideProps } from "next"
import { auth } from "@/auth"
import { AppLayout } from "@/components/layout/app-layout"
import { ApiKeysPanel } from "@/components/settings/ApiKeysPanel"
import { ApiReference } from "@/components/settings/ApiReference"
import { IntegrationsPanel } from "@/components/settings/IntegrationsPanel"
import { DeletionPanel } from "@/components/settings/DeletionPanel"
import { TeamPanel } from "@/components/settings/TeamPanel"
import { ExportPanel } from "@/components/settings/ExportPanel"
import { clsx } from "clsx"

interface SettingsProps {
  slug: string
  workspaceId: string
  userRole: string | null
  userId: string | null
  apiBaseUrl: string
}

const TABS = [
  { key: "general", label: "General" },
  { key: "team", label: "Team" },
  { key: "api-keys", label: "API Keys" },
  { key: "api-reference", label: "API Reference" },
  { key: "integrations", label: "Integrations" },
  { key: "danger-zone", label: "Danger Zone" },
] as const

type TabKey = (typeof TABS)[number]["key"]

export default function SettingsPage({ slug, workspaceId, userRole, userId, apiBaseUrl }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("general")

  return (
    <AppLayout slug={slug}>
      <div className="flex h-full flex-col">
        {/* Page header */}
        <div className="border-b border-gray-200 bg-white px-6 py-4">
          <h1 className="text-lg font-semibold text-gray-900">Workspace Settings</h1>
        </div>

        {/* Tab navigation */}
        <div className="border-b border-gray-200 bg-white px-6">
          <nav className="flex gap-6" aria-label="Settings tabs">
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
          <div className="mx-auto max-w-3xl">
            {activeTab === "general" && (
              <div className="flex flex-col gap-4">
                <div className="rounded-lg border border-gray-200 bg-white p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Workspace</h3>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                    <dt className="text-gray-500">Slug</dt>
                    <dd className="font-mono text-gray-900">{slug}</dd>
                    <dt className="text-gray-500">Workspace ID</dt>
                    <dd>
                      <code className="select-all rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-700">{workspaceId}</code>
                    </dd>
                  </dl>
                  <p className="mt-4 text-xs text-gray-400">
                    Use the Workspace ID when calling the REST API.
                  </p>
                </div>

                {userRole === "admin" && (
                  <ExportPanel workspaceId={workspaceId} />
                )}
              </div>
            )}

            {activeTab === "team" && (
              <TeamPanel
                workspaceId={workspaceId}
                userRole={userRole}
                userId={userId ?? undefined}
              />
            )}

            {activeTab === "api-keys" && (
              <ApiKeysPanel workspaceId={workspaceId} />
            )}

            {activeTab === "api-reference" && (
              <ApiReference workspaceId={workspaceId} apiBaseUrl={apiBaseUrl} />
            )}

            {activeTab === "integrations" && (
              <IntegrationsPanel workspaceId={workspaceId} />
            )}

            {activeTab === "danger-zone" && (
              <DeletionPanel workspaceId={workspaceId} userRole={userRole} />
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
  return {
    props: {
      slug: context.params?.slug as string,
      workspaceId: session.user.workspace_id ?? "",
      userRole: session.user.role ?? null,
      userId: session.user.id ?? null,
      apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.API_URL ?? "",
    },
  }
}
