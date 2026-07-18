import type { GetServerSideProps } from "next"
import { auth } from "@/auth"
import { resolveProject } from "@/lib/project-cache"
import { AppLayout } from "@/components/layout/app-layout"
import { CasesPage } from "@/components/cases/CasesPage"

interface CasesRouteProps {
  slug: string
  projectKey: string
  workspaceId: string
  projectId: string
  testFormat: string
}

export default function CasesRoute({ slug, projectKey, workspaceId, projectId, testFormat }: CasesRouteProps) {
  return (
    <AppLayout slug={slug} projectKey={projectKey}>
      <CasesPage workspaceId={workspaceId} projectId={projectId} testFormat={testFormat} />
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
    context.req.cookies["authjs.session-token"]

  // Resolve projectKey → UUID and test_format (60s server-side cache — this
  // lookup otherwise blocks every client-side navigation to this page)
  const project = await resolveProject(workspaceId, projectKey, token)

  return {
    props: {
      slug,
      projectKey,
      workspaceId,
      projectId: project?.id ?? "",
      testFormat: project?.test_format ?? "steps",
    },
  }
}
