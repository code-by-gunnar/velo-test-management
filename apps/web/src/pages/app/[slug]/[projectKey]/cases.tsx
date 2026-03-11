import type { GetServerSideProps } from "next"
import { auth } from "@/auth"
import { AppLayout } from "@/components/layout/app-layout"
import { CasesPage } from "@/components/cases/CasesPage"

interface CasesRouteProps {
  slug: string
  projectKey: string
  workspaceId: string
  projectId: string
}

export default function CasesRoute({ slug, projectKey, workspaceId, projectId }: CasesRouteProps) {
  return (
    <AppLayout slug={slug} projectKey={projectKey}>
      <CasesPage workspaceId={workspaceId} projectId={projectId} />
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

  // Resolve projectKey → UUID via single-row lookup
  let projectId = ""
  if (workspaceId && token) {
    try {
      const res = await fetch(
        `${process.env.API_URL}/api/workspaces/${workspaceId}/projects/by-key/${projectKey}`,
        { headers: { authorization: `Bearer ${token}` } }
      )
      if (res.ok) {
        const project = await res.json() as { id: string }
        projectId = project.id
      }
    } catch {
      // projectId stays empty — CasesPage will handle the missing state gracefully
    }
  }

  return { props: { slug, projectKey, workspaceId, projectId } }
}
