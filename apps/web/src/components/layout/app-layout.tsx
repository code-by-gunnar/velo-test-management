import React from "react"
import { Sidebar } from "./sidebar"

interface AppLayoutProps {
  slug: string
  projectKey?: string
  children: React.ReactNode
}

export function AppLayout({ slug, projectKey, children }: AppLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-mist">
      <Sidebar slug={slug} {...(projectKey !== undefined ? { projectKey } : {})} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
