import { auth } from "@/auth"
import type { GetServerSidePropsContext } from "next"

export async function requireAuth(context: GetServerSidePropsContext) {
  // Pages Router requires (context) arg — not await auth() with no args
  const session = await auth(context)

  if (!session) {
    return { redirect: { destination: "/login", permanent: false } }
  }

  if (!session.user.workspace_id) {
    // Authenticated but no workspace — redirect to onboarding wizard
    return { redirect: { destination: "/onboarding", permanent: false } }
  }

  return { session }
}

export async function requireUnauthed(context: GetServerSidePropsContext) {
  const session = await auth(context)
  if (session) {
    // Already signed in — send to workspace home if they have one, onboarding if not
    if (session.user.workspace_slug) {
      return { redirect: { destination: `/app/${session.user.workspace_slug}`, permanent: false } }
    }
    return { redirect: { destination: "/onboarding", permanent: false } }
  }
  return {}
}
