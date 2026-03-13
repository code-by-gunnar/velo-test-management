import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/router"
import { Card } from "@/components/ui"

/**
 * Maps Auth.js internal error types to human-readable messages.
 * These are errors thrown by Auth.js itself (not our signIn callback).
 * See: https://authjs.dev/guides/pages/error
 */
const errorMessages: Record<string, { title: string; message: string }> = {
  Configuration: {
    title: "Server configuration error",
    message: "There's a problem with the authentication setup. Please contact support if this persists.",
  },
  AccessDenied: {
    title: "Access denied",
    message: "You declined the sign-in request. If this was a mistake, try signing in again.",
  },
  Verification: {
    title: "Verification failed",
    message: "The sign-in link has expired or has already been used. Please request a new one.",
  },
  OAuthSignin: {
    title: "Could not start sign-in",
    message: "Something went wrong connecting to the sign-in provider. Please try again.",
  },
  OAuthCallback: {
    title: "Sign-in interrupted",
    message: "The sign-in provider returned an error. Please try again.",
  },
  OAuthCreateAccount: {
    title: "Could not create account",
    message: "There was a problem creating your account. Please try a different sign-in method.",
  },
  OAuthAccountNotLinked: {
    title: "Account already exists",
    message: "An account with this email already uses a different sign-in method. Please sign in with your original method.",
  },
  Default: {
    title: "Something went wrong",
    message: "An unexpected error occurred during sign-in. Please try again.",
  },
}

export default function AuthErrorPage() {
  const router = useRouter()
  const errorType = typeof router.query.error === "string" ? router.query.error : "Default"
  const defaultError = { title: "Something went wrong", message: "An unexpected error occurred during sign-in. Please try again." }
  const { title, message } = errorMessages[errorType] ?? defaultError

  return (
    <div className="flex min-h-screen items-center justify-center bg-mist p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Image src="/velo-mark-cobalt.svg" alt="Velo" width={48} height={48} />
        </div>
        <Card padding="lg">
          <h1 className="text-xl font-semibold text-gray-900 mb-1">{title}</h1>
          <p className="text-sm text-gray-500 mb-6">{message}</p>

          <Link
            href="/login"
            className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary text-white text-base font-medium transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Back to sign in
          </Link>
        </Card>
      </div>
    </div>
  )
}
