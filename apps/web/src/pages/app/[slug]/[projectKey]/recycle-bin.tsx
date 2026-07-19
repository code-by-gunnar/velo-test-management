import type { GetServerSideProps } from "next"
import { auth } from "@/auth"
import { resolveProject } from "@/lib/project-cache"
import { AppLayout } from "@/components/layout/app-layout"
import { RecycleBin } from "@/components/recycle-bin/RecycleBin"

interface RecycleBinPageProps {
  slug: string
  projectKey: string
  workspaceId: string
  projectId: string
}

export default function RecycleBinPage({
  slug,
  projectKey,
  workspaceId,
  projectId,
}: RecycleBinPageProps) {
  return (
    <AppLayout slug={slug} projectKey={projectKey}>
      <div className="flex h-full flex-col">
        {/* Page header */}
        <div className="flex items-center border-b border-gray-200 bg-white px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Recycle Bin</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Restore suites and cases you&rsquo;ve deleted
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <RecycleBin workspaceId={workspaceId} projectId={projectId} />
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

  const token =
    context.req.cookies["__Secure-authjs.session-token"] ??
    context.req.cookies["authjs.session-token"] ??
    null

  const project = await resolveProject(workspaceId, projectKey, token ?? undefined)

  return {
    props: {
      slug,
      projectKey,
      workspaceId,
      projectId: project?.id ?? "",
    },
  }
}
