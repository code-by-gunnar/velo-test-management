import React from "react"
import Image from "next/image"
import { useForm } from "react-hook-form"
import { useRouter } from "next/router"
import { Button, Card, FormField, Input } from "@/components/ui"

export default function VerifyPage() {
  const router = useRouter()
  const email = (router.query.email as string) ?? ""
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<{ code: string }>()
  const [message, setMessage] = React.useState("")

  const onSubmit = async ({ code }: { code: string }) => {
    const res = await fetch(`/api/backend/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    })
    const data = await res.json() as { error?: string; message?: string }

    if (!res.ok) {
      setError("code", { message: data.error ?? "Invalid code" })
      return
    }

    const next = typeof router.query.next === "string" ? `&next=${encodeURIComponent(router.query.next)}` : ""
    router.push(`/login?verified=1${next}`)
  }

  const resend = async () => {
    await fetch(`/api/backend/auth/resend-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
    setMessage("A new code has been sent to your email.")
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-mist p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Image src="/velo-mark-cobalt.svg" alt="Velo" width={48} height={48} />
        </div>
        <Card padding="lg">
          <h1 className="text-xl font-semibold text-gray-900 mb-1">Check your inbox</h1>
          <p className="text-sm text-gray-500 mb-6">
            We sent a 6-digit code to <strong className="text-gray-700">{email}</strong>. Enter it below to verify your account.
          </p>

          {message && (
            <div className="rounded-md bg-pass-bg px-3 py-2 text-sm text-pass mb-4" role="status">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField label="Verification code" htmlFor="code" error={errors.code?.message}>
              <Input
                id="code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                error={errors.code?.message}
                {...register("code", {
                  required: "Code is required",
                  pattern: { value: /^\d{6}$/, message: "Must be 6 digits" },
                })}
              />
            </FormField>

            <Button type="submit" variant="primary" size="lg" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Verifying..." : "Verify"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-500">
            Did not receive it?{" "}
            <button
              type="button"
              onClick={resend}
              className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded"
            >
              Resend code
            </button>
          </p>
        </Card>
      </div>
    </div>
  )
}
