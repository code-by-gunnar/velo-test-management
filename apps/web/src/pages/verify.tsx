import React from "react"
import { useForm } from "react-hook-form"
import { useRouter } from "next/router"

export default function VerifyPage() {
  const router = useRouter()
  const email = (router.query.email as string) ?? ""
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError } = useForm<{ code: string }>()
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

    // OTP verified — redirect to login with a success message.
    // For Phase 1: the user must sign in with their password after verification.
    router.push("/login?verified=1")
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
    <main style={{ maxWidth: 400, margin: "80px auto", padding: 24 }}>
      <h1>Check your inbox</h1>
      <p>We sent a 6-digit code to <strong>{email}</strong>. Enter it below to verify your account.</p>
      {message && <p role="status">{message}</p>}
      <form onSubmit={handleSubmit(onSubmit)}>
        <div>
          <label htmlFor="code">Verification code</label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            {...register("code", {
              required: "Code is required",
              pattern: { value: /^\d{6}$/, message: "Must be 6 digits" },
            })}
          />
          {errors.code && <p role="alert">{errors.code.message}</p>}
        </div>
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Verifying..." : "Verify"}
        </button>
      </form>
      <button type="button" onClick={resend}>Resend code</button>
    </main>
  )
}
