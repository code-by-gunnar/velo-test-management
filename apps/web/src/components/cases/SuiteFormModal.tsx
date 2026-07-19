import { useState } from "react"
import { Modal, Button } from "@/components/ui"
import type { Suite } from "@/hooks/useSuiteTree"

interface SuiteFormModalProps {
  isOpen: boolean
  onClose: () => void
  workspaceId: string
  projectId: string
  mode: "create" | "edit"
  suite?: Suite
  parentId?: string | null
  onSaved: () => void
}

export function SuiteFormModal({
  isOpen, onClose, workspaceId, projectId, mode, suite, parentId, onSaved,
}: SuiteFormModalProps) {
  const [name, setName] = useState(mode === "edit" ? (suite?.name ?? "") : "")
  const [description, setDescription] = useState(mode === "edit" ? (suite?.description ?? "") : "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError("Name is required")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const base = `/api/backend/workspaces/${workspaceId}/projects/${projectId}/suites`
      const url = mode === "edit" ? `${base}/${suite!.id}` : base
      const method = mode === "edit" ? "PATCH" : "POST"
      const body: Record<string, unknown> = { name: trimmed, description: description.trim() || null }
      if (mode === "create" && parentId) body.parent_id = parentId
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(b.error ?? `Save failed (${res.status})`)
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === "edit" ? "Edit suite" : "New suite"}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleSave() }}
            maxLength={255}
            className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Description <span className="text-gray-400">(optional)</span></label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={3}
            className="w-full resize-y rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        {error && <p className="text-xs text-fail-text">{error}</p>}
      </div>
    </Modal>
  )
}
