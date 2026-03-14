import { useState, useCallback, useRef } from "react"
import { clsx } from "clsx"
import { useToast } from "@/components/ui/toast"
import { Paperclip, X, Upload, FileText, ImageIcon, Film } from "lucide-react"

interface Attachment {
  id: string
  filename: string
  content_type: string
  size_bytes: number
  url: string
  created_at: string
}

interface EvidenceUploadProps {
  workspaceId: string
  runItemId: string
  canEdit: boolean
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(contentType: string) {
  if (contentType.startsWith("image/")) return <ImageIcon size={14} />
  if (contentType.startsWith("video/")) return <Film size={14} />
  return <FileText size={14} />
}

export function EvidenceUpload({ workspaceId, runItemId, canEdit }: EvidenceUploadProps) {
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const fetchAttachments = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/backend/workspaces/${workspaceId}/run-items/${runItemId}/attachments`
      )
      if (res.ok) {
        const data = await res.json() as Attachment[]
        setAttachments(data)
      }
    } catch {
      // Silent
    } finally {
      setFetched(true)
    }
  }, [workspaceId, runItemId])

  // Fetch on first render
  if (!fetched && !loading) {
    setLoading(true)
    void fetchAttachments().finally(() => setLoading(false))
  }

  const uploadFile = useCallback(async (file: File) => {
    if (attachments.length >= 5) {
      toast("error", "Maximum 5 attachments per test case")
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch(
        `/api/backend/workspaces/${workspaceId}/run-items/${runItemId}/attachments`,
        { method: "POST", body: formData }
      )

      if (res.ok) {
        toast("success", `Uploaded: ${file.name}`)
        // Re-fetch to get presigned URL
        await fetchAttachments()
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string }
        toast("error", data.error ?? "Upload failed")
      }
    } catch {
      toast("error", "Upload failed")
    } finally {
      setUploading(false)
    }
  }, [workspaceId, runItemId, attachments.length, fetchAttachments, toast])

  const handleDelete = useCallback(async (attachmentId: string, filename: string) => {
    try {
      const res = await fetch(
        `/api/backend/workspaces/${workspaceId}/run-items/${runItemId}/attachments/${attachmentId}`,
        { method: "DELETE" }
      )
      if (res.ok || res.status === 204) {
        setAttachments((prev) => prev.filter((a) => a.id !== attachmentId))
        toast("success", `Removed: ${filename}`)
      }
    } catch {
      toast("error", "Failed to remove attachment")
    }
  }, [workspaceId, runItemId, toast])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) void uploadFile(file)
  }, [uploadFile])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void uploadFile(file)
    if (inputRef.current) inputRef.current.value = ""
  }, [uploadFile])

  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 mb-2">
        <Paperclip size={12} className="text-gray-400" />
        <label className="text-xs font-medium text-gray-500">
          Evidence
          {attachments.length > 0 && (
            <span className="ml-1 text-gray-400">({attachments.length})</span>
          )}
        </label>
      </div>

      {/* Attachment list */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map((att) => (
            <a
              key={att.id}
              href={att.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 hover:border-gray-300 hover:shadow-sm transition-all"
            >
              <span className="text-gray-400">{fileIcon(att.content_type)}</span>
              <span className="truncate max-w-[120px]">{att.filename}</span>
              <span className="text-gray-400">{formatSize(att.size_bytes)}</span>

              {canEdit && (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); void handleDelete(att.id, att.filename) }}
                  className="ml-0.5 rounded p-0.5 text-gray-300 hover:bg-gray-100 hover:text-gray-500 transition-colors"
                  aria-label={`Remove ${att.filename}`}
                >
                  <X size={12} />
                </button>
              )}
            </a>
          ))}
        </div>
      )}

      {/* Upload zone */}
      {canEdit && attachments.length < 5 && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={clsx(
            "flex items-center justify-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs cursor-pointer transition-colors",
            dragOver
              ? "border-primary bg-primary-selected text-primary"
              : "border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-500"
          )}
        >
          <Upload size={14} />
          {uploading ? "Uploading…" : "Drop file or click to upload"}
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept="image/*,.pdf,.txt,.csv,.json,.mp4,.webm"
            onChange={handleInputChange}
          />
        </div>
      )}

      {loading && !fetched && (
        <p className="text-xs text-gray-400">Loading attachments…</p>
      )}
    </div>
  )
}
