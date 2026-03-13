import { useState, useEffect } from "react"
import { useRouter } from "next/router"
import { Button } from "@/components/ui/button"
import { Input, FormField } from "@/components/ui/input"

interface CreateProjectModalProps {
  open: boolean
  onClose: () => void
  workspaceId: string
  slug: string
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20)
}

export function CreateProjectModal({ open, onClose, workspaceId, slug }: CreateProjectModalProps) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [projectKey, setProjectKey] = useState("")
  const [keyEdited, setKeyEdited] = useState(false)
  const [error, setError] = useState("")
  const [fieldError, setFieldError] = useState<{ name?: string; project_key?: string }>({})
  const [loading, setLoading] = useState(false)
  const [tierLimited, setTierLimited] = useState(false)

  // Escape key handler
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onClose])

  // Close handler that also resets state
  function handleClose() {
    setName("")
    setProjectKey("")
    setKeyEdited(false)
    setError("")
    setFieldError({})
    setTierLimited(false)
    setLoading(false)
    onClose()
  }

  function handleNameChange(value: string) {
    setName(value)
    if (!keyEdited) {
      setProjectKey(slugify(value))
    }
    setFieldError((prev) => {
      const next = { ...prev }
      delete next.name
      return next
    })
  }

  function handleKeyChange(value: string) {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 20)
    setProjectKey(cleaned)
    setKeyEdited(true)
    setFieldError((prev) => {
      const next = { ...prev }
      delete next.project_key
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setFieldError({})

    const errors: { name?: string; project_key?: string } = {}
    if (!name.trim()) errors.name = "Project name is required"
    if (!projectKey.trim()) errors.project_key = "Project key is required"
    else if (!/^[a-z0-9-]+$/.test(projectKey)) errors.project_key = "Only lowercase letters, numbers, and hyphens"
    if (Object.keys(errors).length > 0) { setFieldError(errors); return }

    setLoading(true)
    try {
      const res = await fetch(`/api/backend/workspaces/${workspaceId}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), project_key: projectKey }),
      })

      if (res.status === 201) {
        const created = await res.json() as { project_key: string }
        localStorage.setItem("velo:last-project-key", created.project_key)
        window.dispatchEvent(new StorageEvent("storage", { key: "velo:last-project-key" }))
        onClose()
        void router.push(`/app/${slug}/${created.project_key}/cases`)
        return
      }

      const data = await res.json() as { error?: string; code?: string; field?: string }

      if (res.status === 403 && data.code === "TIER_LIMIT_EXCEEDED") {
        setTierLimited(true)
        return
      }

      if (res.status === 409 && data.field === "project_key") {
        setFieldError({ project_key: "This project key is already in use" })
        return
      }

      setError(data.error || "Something went wrong")
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-project-title"
    >
      <div className="relative w-full max-w-md rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 id="create-project-title" className="text-base font-semibold text-gray-900 font-display">
            {tierLimited ? "Project limit reached" : "New project"}
          </h2>
          <button type="button" onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            &#10005;
          </button>
        </div>

        {tierLimited ? (
          <div className="px-6 py-8 text-center">
            <p className="text-sm text-gray-600">
              Your free plan allows 1 project. Upgrade to Starter to create more projects.
            </p>
            <div className="mt-6">
              <Button variant="primary" size="sm" onClick={handleClose}>
                Got it
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)}>
            <div className="space-y-4 px-6 py-5">
              {error && (
                <p className="text-sm text-fail" role="alert">{error}</p>
              )}
              <FormField label="Project name" htmlFor="create-project-name" error={fieldError.name}>
                <Input
                  id="create-project-name"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Mobile App"
                  maxLength={255}
                  autoFocus
                  error={fieldError.name}
                />
              </FormField>
              <FormField label="Project key" htmlFor="create-project-key" error={fieldError.project_key}>
                <Input
                  id="create-project-key"
                  value={projectKey}
                  onChange={(e) => handleKeyChange(e.target.value)}
                  placeholder="e.g. mobile-app"
                  maxLength={20}
                  error={fieldError.project_key}
                />
                <p className="text-xs text-gray-500">
                  Used in URLs and integrations. Lowercase letters, numbers, and hyphens only.
                </p>
              </FormField>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
              <Button type="button" variant="secondary" size="sm" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={loading}>
                {loading ? "Creating..." : "Create project"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
