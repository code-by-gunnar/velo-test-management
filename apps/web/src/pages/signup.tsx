import Link from "next/link"
import Image from "next/image"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter } from "next/router"
import { Button, Card, FormField, Input } from "@/components/ui"

const schema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required"),
})

type FormData = z.infer<typeof schema>

export default function SignupPage() {
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
    const res = await fetch(`/api/backend/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })

    if (res.status === 409) {
      setError("email", { message: "An account with this email already exists" })
      return
    }

    if (!res.ok) {
      setError("root", { message: "Something went wrong. Please try again." })
      return
    }

    const next = typeof router.query.next === "string" ? `&next=${encodeURIComponent(router.query.next)}` : ""
    router.push(`/verify?email=${encodeURIComponent(data.email)}${next}`)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-mist p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Image src="/velo-mark-cobalt.svg" alt="Velo" width={48} height={48} />
        </div>
        <Card padding="lg">
          <h1 className="text-xl font-semibold text-gray-900 mb-1">Create your account</h1>
          <p className="text-sm text-gray-500 mb-6">Get started with Velo in seconds.</p>

          {errors.root && (
            <div className="rounded-md bg-fail-bg px-3 py-2 text-sm text-fail-text mb-4" role="alert">
              {errors.root.message}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField label="Name" htmlFor="name" error={errors.name?.message}>
              <Input
                id="name"
                type="text"
                autoComplete="name"
                placeholder="Your full name"
                error={errors.name?.message}
                {...register("name")}
              />
            </FormField>

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
                autoComplete="new-password"
                placeholder="Min. 8 characters"
                error={errors.password?.message}
                {...register("password")}
              />
            </FormField>

            <Button type="submit" variant="primary" size="lg" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Creating account..." : "Create account"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link href={typeof router.query.next === "string" ? `/login?next=${encodeURIComponent(router.query.next)}` : "/login"} className="text-cobalt hover:underline">
              Sign in
            </Link>
          </p>
        </Card>
      </div>
    </div>
  )
}
