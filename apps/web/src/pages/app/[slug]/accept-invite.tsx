import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/router"
import { useSession } from "next-auth/react"
import Link from "next/link"
import type { GetServerSideProps } from "next"
import { auth } from "@/auth"

type PageState = "loading" | "success" | "error"

interface AcceptInviteProps {
  slug: string
  workspaceId: string
  token: string
}

export default function AcceptInvitePage({ slug, workspaceId, token }: AcceptInviteProps) {
  const router = useRouter()
  const { update } = useSession()
  const [state, setState] = useState<PageState>("loading")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const startedRef = useRef(false)

  const acceptInvite = useCallback(
    (onSuccess: () => void, onError: (msg: string) => void) => {
      fetch(`/api/backend/workspaces/${workspaceId}/invitations/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
        .then(async (res) => {
          if (!res.ok) {
            const body = await res.json() as { message?: string }
            onError(body.message ?? "Invalid or expired invitation.")
            return
          }
          onSuccess()
        })
        .catch(() => {
          onError("An unexpected error occurred. Please try again.")
        })
    },
    [workspaceId, token]
  )

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    acceptInvite(
      () => {
        setState("success")
        // Refresh JWT with new workspace_id/slug so requireAuth
        // doesn't bounce to /onboarding on the next page load
        void update({ workspace_id: workspaceId, workspace_slug: slug }).then(() => {
          setTimeout(() => {
            void router.push(`/app/${slug}`)
          }, 2000)
        })
      },
      (msg) => {
        setErrorMessage(msg)
        setState("error")
      }
    )
  }, [acceptInvite, router, slug, update, workspaceId])

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F5F3EF] px-4">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-[#FAFAF8] p-8 shadow-sm text-center">
        {state === "loading" && (
          <>
            <p className="text-sm font-medium text-gray-700">Accepting your invitation...</p>
            <p className="mt-1 text-xs text-gray-400">Please wait a moment.</p>
          </>
        )}

        {state === "success" && (
          <>
            <div className="mb-3 text-3xl">&#10003;</div>
            <p className="text-sm font-semibold text-gray-900">You&apos;ve joined the workspace!</p>
            <p className="mt-1 text-xs text-gray-500">Redirecting you now...</p>
          </>
        )}

        {state === "error" && (
          <>
            <p className="text-sm font-semibold text-gray-900">Invitation not valid</p>
            <p className="mt-1 text-sm text-gray-500">
              {errorMessage ?? "This invitation link is invalid or has expired."}
            </p>
            <p className="mt-4 text-xs text-gray-400">
              Contact your workspace admin to request a new invitation, or{" "}
              <Link href="/login" className="text-cobalt underline hover:no-underline">
                sign in
              </Link>{" "}
              if you already have access.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await auth(context)
  const resolvedSlug = context.params?.slug as string
  const { token, workspace } = context.query as { token?: string; workspace?: string }

  if (!session) {
    const next = encodeURIComponent(
      `/app/${resolvedSlug}/accept-invite?token=${token ?? ""}&workspace=${workspace ?? ""}`
    )
    return {
      redirect: {
        destination: `/login?next=${next}`,
        permanent: false,
      },
    }
  }

  if (!token) {
    return {
      redirect: {
        destination: `/app/${resolvedSlug}`,
        permanent: false,
      },
    }
  }

  // Prefer workspace ID from query param (passed through invite flow),
  // fall back to session workspace for existing members
  const workspaceId = workspace ?? session.user.workspace_id ?? ""

  return {
    props: {
      slug: resolvedSlug,
      workspaceId,
      token,
    },
  }
}
