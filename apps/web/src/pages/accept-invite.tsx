import type { GetServerSideProps } from "next"
import { auth } from "@/auth"

/**
 * Top-level /accept-invite landing page.
 *
 * The invite email links here with ?token=...&workspace=<workspaceId>.
 * This page resolves the workspace slug server-side and redirects to
 * /app/[slug]/accept-invite?token=... where the actual acceptance happens.
 *
 * If the user is not authenticated, redirects to /login with ?next= so
 * they land back here after signing in.
 */
export default function AcceptInviteRedirect() {
  // This page always redirects server-side — never renders.
  return null
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { token, workspace } = context.query as {
    token?: string
    workspace?: string
  }

  if (!token || !workspace) {
    return {
      redirect: { destination: "/login", permanent: false },
    }
  }

  const session = await auth(context)

  if (!session) {
    const next = encodeURIComponent(
      `/accept-invite?token=${token}&workspace=${workspace}`
    )
    return {
      redirect: { destination: `/login?next=${next}`, permanent: false },
    }
  }

  // Look up workspace slug from the API
  const apiBase =
    process.env.BACKEND_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3001"

  const cookie = context.req.headers.cookie ?? ""
  const sessionToken =
    cookie.match(/__Secure-authjs\.session-token=([^;]+)/)?.[1] ??
    cookie.match(/authjs\.session-token=([^;]+)/)?.[1] ??
    ""

  try {
    const res = await fetch(`${apiBase}/api/workspaces`, {
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    })

    if (res.ok) {
      const data = (await res.json()) as Array<{ id: string; slug: string }>
      const match = data.find((w) => w.id === workspace)

      if (match) {
        return {
          redirect: {
            destination: `/app/${match.slug}/accept-invite?token=${token}&workspace=${workspace}`,
            permanent: false,
          },
        }
      }
    }
  } catch {
    // API unreachable — fall through to fallback
  }

  // Fallback: can't resolve slug — try using workspace ID directly
  // The [slug] page will 404 but at least the user sees something
  return {
    redirect: {
      destination: `/app/${workspace}/accept-invite?token=${token}&workspace=${workspace}`,
      permanent: false,
    },
  }
}
