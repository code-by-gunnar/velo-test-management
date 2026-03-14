import { ExternalLink } from "lucide-react"
import { clsx } from "clsx"

interface DefectBadgeProps {
  externalUrl?: string | null
  externalStatus?: string | null
  externalId?: string | null
}

function statusStyle(status: string): string {
  const s = status.toLowerCase()
  if (s === "done" || s === "completed" || s === "closed") {
    return "bg-pass-bg text-pass-text border-pass/20"
  }
  if (s === "in progress" || s === "started" || s === "in_progress") {
    return "bg-primary-selected text-primary border-primary/20"
  }
  if (s === "cancelled" || s === "canceled") {
    return "bg-skipped-bg text-skipped-text border-skipped/20"
  }
  // Todo, Backlog, Triage, or unknown
  return "bg-gray-100 text-gray-500 border-gray-200"
}

export function DefectBadge({ externalUrl, externalStatus, externalId }: DefectBadgeProps) {
  if (!externalUrl) return null

  const status = externalStatus ?? "Linked"
  const label = externalId ?? status

  return (
    <a
      href={externalUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={externalId ? `${externalId} · ${status}` : status}
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80",
        statusStyle(status)
      )}
    >
      <ExternalLink size={10} className="shrink-0" />
      <span className="truncate max-w-[6rem]">{label}</span>
    </a>
  )
}
