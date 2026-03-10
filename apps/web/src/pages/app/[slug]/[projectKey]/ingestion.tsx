import type { GetServerSideProps } from "next"
import { auth } from "@/auth"
import { AppLayout } from "@/components/layout/app-layout"
import { SetupGuide } from "@/components/ingestion/SetupGuide"
import { IngestionHistory } from "@/components/ingestion/IngestionHistory"

interface IngestionPageProps {
  slug: string
  projectKey: string
  workspaceId: string
  projectId: string
  hasApiKeys: boolean
}

export default function IngestionPage({
  slug,
  projectKey,
  workspaceId,
  projectId,
  hasApiKeys,
}: IngestionPageProps) {
  return (
    <AppLayout slug={slug} projectKey={projectKey}>
      <div className="flex h-full flex-col">
        {/* Page header */}
        <div className="flex items-center border-b border-gray-200 bg-white px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">CI Ingestion</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Push test results from your CI pipeline
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto w-full max-w-3xl flex-col gap-6 flex">
            <SetupGuide
              workspaceId={workspaceId}
              projectId={projectId}
              slug={slug}
              hasApiKeys={hasApiKeys}
            />
            <IngestionHistory
              workspaceId={workspaceId}
              projectId={projectId}
              slug={slug}
              projectKey={projectKey}
            />
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
  let hasApiKeys = false

  if (workspaceId && token) {
    // Resolve project ID from project key
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

    // Check if workspace has any API keys (for setup guide prompt)
    try {
      const keysRes = await fetch(
        `${apiUrl}/api/workspaces/${workspaceId}/api-keys`,
        { headers: { authorization: `Bearer ${token}` } }
      )
      if (keysRes.ok) {
        const keys = await keysRes.json() as Array<{ revoked_at: string | null }>
        hasApiKeys = keys.some((k) => k.revoked_at === null)
      }
    } catch {
      // hasApiKeys stays false
    }
  }

  return {
    props: {
      slug,
      projectKey,
      workspaceId,
      projectId,
      hasApiKeys,
    },
  }
}
