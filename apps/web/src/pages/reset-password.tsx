import React from "react"
import Link from "next/link"
import Image from "next/image"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter } from "next/router"
import { Button, Card, FormField, Input } from "@/components/ui"

const schema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })

type FormData = z.infer<typeof schema>

export default function ResetPasswordPage() {
  const router = useRouter()
  const token = (router.query.token as string) ?? ""
  const email = (router.query.email as string) ?? ""
  const [done, setDone] = React.useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    const res = await fetch(`/api/backend/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, token, password: data.password }),
    })

    if (!res.ok) {
      setError("root", { message: "Invalid or expired reset link. Please request a new one." })
      return
    }

    setDone(true)
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-mist p-4">
        <div className="w-full max-w-md">
          <div className="mb-8 flex justify-center">
            <Image src="/velo-mark-cobalt.svg" alt="Velo" width={48} height={48} />
          </div>
          <Card padding="lg">
            <h1 className="text-xl font-semibold text-gray-900 mb-1">Password updated</h1>
            <p className="text-sm text-gray-500 mb-6">
              Your password has been reset. You can now sign in with your new password.
            </p>
            <Link href="/login">
              <Button variant="primary" size="lg" className="w-full">
                Sign in
              </Button>
            </Link>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-mist p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Image src="/velo-mark-cobalt.svg" alt="Velo" width={48} height={48} />
        </div>
        <Card padding="lg">
          <h1 className="text-xl font-semibold text-gray-900 mb-1">Set a new password</h1>
          <p className="text-sm text-gray-500 mb-6">Choose a strong password for your account.</p>

          {errors.root && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-fail-text mb-4" role="alert">
              {errors.root.message}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField label="New password" htmlFor="password" error={errors.password?.message}>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="Min. 8 characters"
                error={errors.password?.message}
                {...register("password")}
              />
            </FormField>

            <FormField label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword?.message}>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Repeat your password"
                error={errors.confirmPassword?.message}
                {...register("confirmPassword")}
              />
            </FormField>

            <Button type="submit" variant="primary" size="lg" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Resetting..." : "Reset password"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
