import { clsx } from "clsx"

export type TestFormat = "steps" | "gwt"

interface FormatPickerProps {
  value: TestFormat
  onChange: (format: TestFormat) => void
}

interface FormatCardProps {
  selected: boolean
  onClick: () => void
  title: string
  description: string
  preview: React.ReactNode
}

function FormatCard({ selected, onClick, title, description, preview }: FormatCardProps) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick()
        }
      }}
      className={clsx(
        "cursor-pointer rounded-md border p-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        selected
          ? "border-primary bg-primary-selected"
          : "border-gray-200 bg-white hover:border-gray-300"
      )}
    >
      <p className="text-sm font-medium text-gray-900">{title}</p>
      <p className="text-xs text-gray-500">{description}</p>
      {preview}
    </div>
  )
}

function StepsPreview() {
  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-2 text-[10px] text-gray-400">
        <span className="w-1/2">Action</span>
        <span className="w-1/2">Expected</span>
      </div>
      <div className="flex gap-2">
        <div className="h-2 w-1/2 rounded bg-gray-200" />
        <div className="h-2 w-1/2 rounded bg-gray-200" />
      </div>
      <div className="flex gap-2">
        <div className="h-2 w-1/2 rounded bg-gray-200" />
        <div className="h-2 w-1/2 rounded bg-gray-200" />
      </div>
    </div>
  )
}

function GwtPreview() {
  return (
    <div className="mt-2 space-y-1">
      {(["Given", "When", "Then"] as const).map((kw) => (
        <div key={kw} className="flex items-center gap-1.5">
          <span className="shrink-0 rounded bg-gray-100 px-1 text-[10px] font-medium text-gray-500">
            {kw}
          </span>
          <div className="h-2 flex-1 rounded bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

export function FormatPicker({ value, onChange }: FormatPickerProps) {
  return (
    <div className="grid grid-cols-2 gap-3" role="radiogroup">
      <FormatCard
        selected={value === "steps"}
        onClick={() => onChange("steps")}
        title="Traditional Steps"
        description="Action and Expected Result columns"
        preview={<StepsPreview />}
      />
      <FormatCard
        selected={value === "gwt"}
        onClick={() => onChange("gwt")}
        title="Given-When-Then"
        description="BDD keyword-prefixed steps"
        preview={<GwtPreview />}
      />
    </div>
  )
}
