import { useState, useEffect, useRef } from "react"
import type { GetServerSideProps } from "next"
import { useSession } from "next-auth/react"
import { auth } from "@/auth"
import { useCachedState } from "@/hooks/useCachedState"
import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Input, FormField } from "@/components/ui/input"
import { Camera } from "lucide-react"

interface ProfileProps {
  slug: string
}

interface ProfileData {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
}

type EmailStep = "idle" | "entering" | "verifying"

export default function ProfilePage({ slug }: ProfileProps) {
  const { data: session, update: updateSession } = useSession()

  const sessionName = session?.user?.name ?? ""
  const sessionEmail = session?.user?.email ?? ""

  // Cached profile renders instantly on revisit; the mount fetch refreshes it
  const [profile, setProfile, hadProfileCache] = useCachedState<ProfileData | null>(
    "velo:profile",
    null
  )
  const [loading, setLoading] = useState(!hadProfileCache)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [name, setName] = useState(sessionName)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // Email change flow
  const [emailStep, setEmailStep] = useState<EmailStep>("idle")
  const [newEmail, setNewEmail] = useState("")
  const [otpCode, setOtpCode] = useState("")
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailSending, setEmailSending] = useState(false)

  const [avatarUrl, setAvatarUrl] = useCachedState<string | null>(
    "velo:avatar-url",
    null
  )
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Erasure section state
  const [erasureStatus, setErasureStatus] = useState<{
    has_pending_erasure: boolean
    status?: string
    scheduled_at?: string
  } | null>(null)
  const [erasureLoading, setErasureLoading] = useState(false)
  const [erasureError, setErasureError] = useState<string | null>(null)
  const [confirmingErasure, setConfirmingErasure] = useState(false)

  // Sync from session when it loads
  const initializedRef = useRef(false)
  useEffect(() => {
    if (!initializedRef.current && sessionName) {
      setName(sessionName)
      initializedRef.current = true
    }
  }, [sessionName])

  // Fetch profile + avatar URL from API
  useEffect(() => {
    async function load() {
      try {
        const [profileRes, avatarRes] = await Promise.all([
          fetch("/api/backend/me"),
          fetch("/api/backend/me/avatar-url"),
        ])
        if (profileRes.ok) {
          const data = (await profileRes.json()) as ProfileData
          setProfile(data)
          setName(data.name ?? "")
          initializedRef.current = true
        } else {
          const err = (await profileRes.json().catch(() => ({}))) as { error?: string }
          setFetchError(err.error ?? `Failed to load profile (${profileRes.status})`)
        }
        if (avatarRes.ok) {
          const data = (await avatarRes.json()) as { url: string | null }
          setAvatarUrl(data.url)
        }
        const erasureRes = await fetch("/api/backend/me/erasure-status")
        if (erasureRes.ok) {
          const erasureData = (await erasureRes.json()) as {
            has_pending_erasure: boolean
            status?: string
            scheduled_at?: string
          }
          setErasureStatus(erasureData)
        }
      } catch {
        setFetchError("Could not reach the API")
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [setProfile, setAvatarUrl])

  const currentEmail = profile?.email ?? sessionEmail

  const initials = name
    ? name
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : currentEmail
      ? currentEmail.charAt(0).toUpperCase()
      : "?"

  const nameChanged = profile && name.trim() !== (profile.name ?? "")

  async function handleSaveName() {
    setSaving(true)
    setSaveMessage(null)
    try {
      const res = await fetch("/api/backend/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!res.ok) {
        const err = (await res.json()) as { error?: string }
        setSaveMessage(err.error ?? "Failed to save")
        return
      }
      const updated = (await res.json()) as ProfileData
      setProfile(updated)
      await updateSession({ name: updated.name })
      setSaveMessage("Saved")
      setTimeout(() => setSaveMessage(null), 2000)
    } finally {
      setSaving(false)
    }
  }

  async function handleSendEmailCode() {
    setEmailSending(true)
    setEmailError(null)
    try {
      const res = await fetch("/api/backend/me/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail.trim() }),
      })
      if (!res.ok) {
        const err = (await res.json()) as { error?: string }
        setEmailError(err.error ?? "Failed to send code")
        return
      }
      setEmailStep("verifying")
      setOtpCode("")
    } finally {
      setEmailSending(false)
    }
  }

  async function handleVerifyEmailCode() {
    setEmailSending(true)
    setEmailError(null)
    try {
      const res = await fetch("/api/backend/me/verify-email-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: otpCode }),
      })
      if (!res.ok) {
        const err = (await res.json()) as { error?: string }
        setEmailError(err.error ?? "Verification failed")
        return
      }
      const data = (await res.json()) as { email: string }
      // Update local state + session
      if (profile) {
        setProfile({ ...profile, email: data.email })
      }
      await updateSession({ email: data.email })
      setEmailStep("idle")
      setNewEmail("")
      setOtpCode("")
    } finally {
      setEmailSending(false)
    }
  }

  async function handleAvatarUpload(file: File) {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/backend/me/avatar", {
        method: "POST",
        body: formData,
      })
      if (!res.ok) {
        const err = (await res.json()) as { error?: string }
        setSaveMessage(err.error ?? "Upload failed")
        return
      }
      const urlRes = await fetch("/api/backend/me/avatar-url")
      if (urlRes.ok) {
        const data = (await urlRes.json()) as { url: string | null }
        setAvatarUrl(data.url)
      }
    } finally {
      setUploading(false)
    }
  }

  async function handleRequestErasure() {
    setErasureLoading(true)
    setErasureError(null)
    try {
      const res = await fetch("/api/backend/me/request-erasure", { method: "POST" })
      if (!res.ok) {
        const err = (await res.json()) as { error?: string }
        setErasureError(err.error ?? "Failed to request erasure")
        return
      }
      const data = (await res.json()) as { scheduled_at: string }
      setErasureStatus({ has_pending_erasure: true, status: "pending", scheduled_at: data.scheduled_at })
      setConfirmingErasure(false)
    } finally {
      setErasureLoading(false)
    }
  }

  async function handleCancelErasure() {
    setErasureLoading(true)
    setErasureError(null)
    try {
      const res = await fetch("/api/backend/me/cancel-erasure", { method: "POST" })
      if (!res.ok) {
        const err = (await res.json()) as { error?: string }
        setErasureError(err.error ?? "Failed to cancel")
        return
      }
      setErasureStatus({ has_pending_erasure: false })
    } finally {
      setErasureLoading(false)
    }
  }

  if (loading) {
    return (
      <AppLayout slug={slug}>
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-gray-400">Loading...</p>
        </div>
      </AppLayout>
    )
  }

  if (fetchError) {
    return (
      <AppLayout slug={slug}>
        <div className="flex h-full flex-col items-center justify-center gap-2">
          <p className="text-sm text-gray-500">{fetchError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-sm text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout slug={slug}>
      <div className="flex h-full flex-col">
        <div className="border-b border-gray-200 bg-white px-6 py-4">
          <h1 className="text-lg font-semibold text-gray-900">Profile</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-lg space-y-8">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="group relative flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 overflow-hidden transition-colors hover:bg-gray-200 disabled:opacity-50"
                title="Change avatar"
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt="Avatar"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-2xl font-semibold text-gray-500">
                    {initials}
                  </span>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                  <Camera
                    size={20}
                    className="text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                </div>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleAvatarUpload(file)
                  e.target.value = ""
                }}
              />
              {uploading && (
                <p className="text-xs text-gray-400">Uploading...</p>
              )}
            </div>

            {/* Name */}
            <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
              <FormField label="Name" htmlFor="profile-name">
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </FormField>

              <div className="flex items-center gap-3 pt-1">
                <Button
                  size="sm"
                  onClick={handleSaveName}
                  disabled={saving || !nameChanged}
                >
                  {saving ? "Saving..." : "Save"}
                </Button>
                {saveMessage && (
                  <span
                    className={
                      saveMessage === "Saved"
                        ? "text-sm text-pass-text"
                        : "text-sm text-fail-text"
                    }
                  >
                    {saveMessage}
                  </span>
                )}
              </div>
            </div>

            {/* Email */}
            <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <div className="mt-1.5 flex items-center gap-3">
                  <span className="text-sm text-gray-900">{currentEmail}</span>
                  {emailStep === "idle" && (
                    <button
                      type="button"
                      onClick={() => {
                        setEmailStep("entering")
                        setNewEmail("")
                        setEmailError(null)
                      }}
                      className="text-sm text-primary hover:underline"
                    >
                      Change
                    </button>
                  )}
                </div>
              </div>

              {emailStep === "entering" && (
                <div className="space-y-3">
                  <FormField label="New email" htmlFor="new-email">
                    <Input
                      id="new-email"
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="new@example.com"
                      autoFocus
                    />
                  </FormField>
                  {emailError && (
                    <p className="text-xs text-fail-text">{emailError}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={handleSendEmailCode}
                      disabled={emailSending || !newEmail.trim()}
                    >
                      {emailSending ? "Sending..." : "Send code"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEmailStep("idle")
                        setEmailError(null)
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {emailStep === "verifying" && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500">
                    Enter the 6-digit code sent to <span className="font-medium text-gray-700">{newEmail}</span>
                  </p>
                  <Input
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    inputMode="numeric"
                    maxLength={6}
                    className="max-w-[160px] text-center font-mono text-lg tracking-widest"
                    autoFocus
                  />
                  {emailError && (
                    <p className="text-xs text-fail-text">{emailError}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={handleVerifyEmailCode}
                      disabled={emailSending || otpCode.length !== 6}
                    >
                      {emailSending ? "Verifying..." : "Verify"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEmailStep("idle")
                        setEmailError(null)
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Data Erasure */}
            <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">Delete my data</h3>

              {erasureStatus?.has_pending_erasure ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    Your data is scheduled for deletion on{" "}
                    <span className="font-medium text-gray-900">
                      {new Date(erasureStatus.scheduled_at!).toLocaleDateString("en-GB", {
                        day: "numeric", month: "long", year: "numeric"
                      })}
                    </span>
                  </p>
                  <p className="text-sm text-gray-500">
                    {(() => {
                      const days = Math.ceil((new Date(erasureStatus.scheduled_at!).getTime() - Date.now()) / 86400000)
                      return days > 0 ? `${days} day${days !== 1 ? "s" : ""} remaining` : "Processing..."
                    })()}
                  </p>
                  {erasureError && <p className="text-xs text-fail-text">{erasureError}</p>}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleCancelErasure}
                    disabled={erasureLoading}
                  >
                    {erasureLoading ? "Cancelling..." : "Cancel erasure request"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    Request deletion of your personal data. Your account will be anonymized after a 7-day grace period.
                    You will be signed out immediately.
                  </p>

                  {!confirmingErasure ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setConfirmingErasure(true)}
                    >
                      Request data erasure
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-gray-500">
                        Are you sure? You will be signed out immediately and your data will be permanently deleted in 7 days.
                      </p>
                      {erasureError && <p className="text-xs text-fail-text">{erasureError}</p>}
                      <div className="flex gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleRequestErasure}
                          disabled={erasureLoading}
                        >
                          {erasureLoading ? "Requesting..." : "Confirm erasure"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setConfirmingErasure(false)
                            setErasureError(null)
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await auth(context)
  if (!session) return { redirect: { destination: "/login", permanent: false } }
  return {
    props: {
      slug: context.params?.slug as string,
    },
  }
}
