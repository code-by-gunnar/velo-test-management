import Link from "next/link"
import Image from "next/image"
import { signIn } from "next-auth/react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter } from "next/router"
import { Button, Card, FormField, Input } from "@/components/ui"
import { SocialAuthButtons, AuthDivider } from "@/components/auth/social-auth-buttons"

const schema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

type FormData = z.infer<typeof schema>

/** Maps OAuth error codes (from signIn callback redirects) to user-friendly messages */
const oauthErrorMessages: Record<string, string> = {
  no_email: "Your account doesn't have a public email address. Please update your provider settings and try again.",
  oauth_error: "Something went wrong during sign-in. Please try again.",
  unverified_email: "An account with this email already exists but hasn't been verified. Please check your inbox for the verification email.",
  provider_conflict: "This email is already linked to a different sign-in method. Please use your original sign-in method.",
}

export default function LoginPage() {
  const router = useRouter()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    const result = await signIn("credentials", {
      ...data,
      redirect: false,
    })

    if (result?.error) {
      setError("root", { message: "Invalid email or password" })
      return
    }

    const next = typeof router.query.next === "string" ? router.query.next : "/onboarding"
    router.push(next)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-mist p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Link href="/">
            <Image src="/velo-mark-cobalt.svg" alt="Velo" width={48} height={48} />
          </Link>
        </div>
        <Card padding="lg">
          <h1 className="text-xl font-semibold text-gray-900 mb-1">Sign in to Velo</h1>
          <p className="text-sm text-gray-500 mb-6">Welcome back. Enter your credentials to continue.</p>

          {typeof router.query.next === "string" && router.query.next.includes("accept-invite") && (
            <div className="rounded-md bg-primary-selected px-3 py-2 text-sm text-primary mb-4" role="status">
              Sign in to accept your invitation. No account yet?{" "}
              <a href={`/signup?next=${encodeURIComponent(router.query.next)}`} className="font-medium underline">
                Create one first
              </a>
            </div>
          )}

          {router.query.verified && (
            <div className="rounded-md bg-pass-bg px-3 py-2 text-sm text-pass mb-4" role="status">
              Email verified. You can now sign in.
            </div>
          )}

          {typeof router.query.error === "string" && router.query.error in oauthErrorMessages && (
            <div className="rounded-md bg-fail-bg px-3 py-2 text-sm text-fail-text mb-4" role="alert">
              {oauthErrorMessages[router.query.error]}
            </div>
          )}

          {errors.root && (
            <div className="rounded-md bg-fail-bg px-3 py-2 text-sm text-fail-text mb-4" role="alert">
              {errors.root.message}
            </div>
          )}

          <SocialAuthButtons callbackUrl={typeof router.query.next === "string" ? router.query.next : "/onboarding"} />
          <AuthDivider />

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField label="Email" htmlFor="email" error={errors.email?.message}>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                error={errors.email?.message}
                {...register("email")}
              />
            </FormField>

            <FormField label="Password" htmlFor="password" error={errors.password?.message}>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Min. 8 characters"
                error={errors.password?.message}
                {...register("password")}
              />
            </FormField>

            <Button type="submit" variant="primary" size="lg" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-500">
            <Link href="/forgot-password" className="text-primary hover:underline">
              Forgot your password?
            </Link>
          </p>
          <p className="mt-2 text-center text-sm text-gray-500">
            No account?{" "}
            <Link href={typeof router.query.next === "string" ? `/signup?next=${encodeURIComponent(router.query.next)}` : "/signup"} className="text-primary hover:underline">
              Create one
            </Link>
          </p>
        </Card>
      </div>
    </div>
  )
}
