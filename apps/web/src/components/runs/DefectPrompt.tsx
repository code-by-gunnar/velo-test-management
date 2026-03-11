import React, { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"

interface DefectPromptProps {
  isOpen: boolean
  caseTitle: string
  onFile: (title: string, description: string) => void
  onSkip: () => void
}

export function DefectPrompt({ isOpen, caseTitle, onFile, onSkip }: DefectPromptProps) {
  const titleRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Focus title input when opened
  useEffect(() => {
    if (isOpen && titleRef.current) {
      titleRef.current.focus()
      titleRef.current.select()
    }
  }, [isOpen])

  // Esc key dismisses the prompt
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        onSkip()
      }
    }
    document.addEventListener("keydown", handleKeyDown, true)
    return () => document.removeEventListener("keydown", handleKeyDown, true)
  }, [isOpen, onSkip])

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const title = (data.get("title") as string).trim()
    const description = (data.get("description") as string | null)?.trim() ?? ""
    if (!title) return
    onFile(title, description)
  }

  if (!isOpen) return null

  return (
    <div className="rounded-lg border border-fail/30 bg-fail-bg p-4 my-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-fail-text">File a defect for this failure?</p>
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Skip (Esc)
        </button>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
        <div>
          <input
            ref={titleRef}
            name="title"
            type="text"
            defaultValue={`Failed: ${caseTitle}`}
            placeholder="Defect title"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <textarea
            name="description"
            rows={2}
            placeholder="Description (optional)"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" variant="destructive" size="sm">
            File Defect
          </Button>
          <button
            type="button"
            className="text-xs text-gray-500 hover:text-gray-700 underline"
            onClick={onSkip}
          >
            Skip
          </button>
          <span className="ml-auto text-xs text-gray-400">
            Enter to file
          </span>
        </div>
      </form>
    </div>
  )
}
