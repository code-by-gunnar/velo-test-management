import Link from "next/link"
import Image from "next/image"
import { signIn } from "next-auth/react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter } from "next/router"
import { Button, Card, FormField, Input } from "@/components/ui"

const schema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

type FormData = z.infer<typeof schema>

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

    router.push("/onboarding")
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-mist p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Image src="/velo-mark-cobalt.svg" alt="Velo" width={48} height={48} />
        </div>
        <Card padding="lg">
          <h1 className="text-xl font-semibold text-gray-900 mb-1">Sign in to Velo</h1>
          <p className="text-sm text-gray-500 mb-6">Welcome back. Enter your credentials to continue.</p>

          {router.query.verified && (
            <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-pass mb-4" role="status">
              Email verified. You can now sign in.
            </div>
          )}

          {errors.root && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-fail-text mb-4" role="alert">
              {errors.root.message}
            </div>
          )}

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
            <Link href="/forgot-password" className="text-cobalt hover:underline">
              Forgot your password?
            </Link>
          </p>
          <p className="mt-2 text-center text-sm text-gray-500">
            No account?{" "}
            <Link href="/signup" className="text-cobalt hover:underline">
              Create one
            </Link>
          </p>
        </Card>
      </div>
    </div>
  )
}
