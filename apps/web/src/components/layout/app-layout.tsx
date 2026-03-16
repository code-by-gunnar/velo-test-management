import React from "react"
import { Sidebar } from "./sidebar"

interface AppLayoutProps {
  slug: string
  projectKey?: string
  children: React.ReactNode
}

const isStaging = process.env.NEXT_PUBLIC_API_BASE_URL?.includes("staging") ?? false

export function AppLayout({ slug, projectKey, children }: AppLayoutProps) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-mist">
      {isStaging && (
        <div className="shrink-0 bg-blocked text-white text-center text-[11px] font-medium py-0.5">
          Staging Environment
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar slug={slug} {...(projectKey !== undefined ? { projectKey } : {})} />
        <main className="flex-1 overflow-hidden p-4">
          <div className="flex h-full flex-col overflow-hidden rounded-xl bg-white shadow-card">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
