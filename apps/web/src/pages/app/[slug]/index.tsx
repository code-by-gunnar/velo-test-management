import type { GetServerSideProps } from "next"
import { auth } from "@/auth"

// Workspace root — always redirects to the first project's cases page.
// Rendered only on the server; the component itself is never shown.
export default function WorkspaceRootPage() {
  return null
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await auth(context)
  if (!session) {
    return { redirect: { destination: "/login", permanent: false } }
  }

  const { slug } = context.params as { slug: string }
  let workspaceId = session.user.workspace_id

  // Read the raw JWE token so we can authenticate the server-side fetch to Railway.
  const token =
    context.req.cookies["__Secure-authjs.session-token"] ??
    context.req.cookies["authjs.session-token"]

  // If workspace_id is not in the JWT yet (e.g., just accepted an invite and JWT
  // hasn't propagated), look up the workspace by slug from the URL.
  if (!workspaceId) {
    try {
      const slugRes = await fetch(
        `${process.env.API_URL}/api/workspaces/${slug}`,
        { headers: token ? { authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(8_000) }
      )
      if (slugRes.ok) {
        const data = await slugRes.json() as { id: string }
        workspaceId = data.id
      }
    } catch {
      // API unreachable — fall through
    }
  }

  if (!workspaceId) {
    return { redirect: { destination: "/onboarding", permanent: false } }
  }

  try {
    const res = await fetch(
      `${process.env.API_URL}/api/workspaces/${workspaceId}/projects`,
      { headers: token ? { authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(8_000) }
    )
    if (res.ok) {
      const projects = await res.json() as Array<{ id: string; project_key: string }>
      if (projects.length > 0) {
        return {
          redirect: {
            destination: `/app/${slug}/${projects[0]!.project_key}/cases`,
            permanent: false,
          },
        }
      }
    }
  } catch {
    // API unreachable — fall through to onboarding
  }

  // No projects found — send back to onboarding to create one
  return { redirect: { destination: "/onboarding", permanent: false } }
}
