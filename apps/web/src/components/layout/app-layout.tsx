import React from "react"
import { Sidebar } from "./sidebar"

interface AppLayoutProps {
  slug: string
  projectKey?: string
  children: React.ReactNode
}

export function AppLayout({ slug, projectKey, children }: AppLayoutProps) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-mist">
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
