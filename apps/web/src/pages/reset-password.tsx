import React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter } from "next/router"

const schema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
})

type FormData = z.infer<typeof schema>

export default function ResetPasswordPage() {
  const router = useRouter()
  const token = router.query.token as string ?? ""
  const email = router.query.email as string ?? ""
  const [done, setDone] = React.useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/reset-password`, {
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
      <main style={{ maxWidth: 400, margin: "80px auto", padding: 24 }}>
        <h1>Password reset</h1>
        <p>Your password has been reset. You can now sign in with your new password.</p>
        <p><a href="/login">Sign in</a></p>
      </main>
    )
  }

  return (
    <main style={{ maxWidth: 400, margin: "80px auto", padding: 24 }}>
      <h1>Set a new password</h1>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div>
          <label htmlFor="password">New password</label>
          <input id="password" type="password" {...register("password")} />
          {errors.password && <p role="alert">{errors.password.message}</p>}
        </div>
        <div>
          <label htmlFor="confirmPassword">Confirm password</label>
          <input id="confirmPassword" type="password" {...register("confirmPassword")} />
          {errors.confirmPassword && <p role="alert">{errors.confirmPassword.message}</p>}
        </div>
        {errors.root && <p role="alert">{errors.root.message}</p>}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Resetting..." : "Reset password"}
        </button>
      </form>
    </main>
  )
}
