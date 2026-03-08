import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/router"
import { signOut, useSession } from "next-auth/react"
import { clsx } from "clsx"

interface SidebarProps {
  slug: string
  projectKey?: string
}

const STORAGE_KEY = "velo:sidebar-collapsed"

// Navigation items with their Phase availability
const NAV_ITEMS = [
  {
    label: "Dashboard",
    href: (slug: string, key?: string) => key ? `/app/${slug}/${key}` : `/app/${slug}`,
    icon: "\u229F",  // placeholder — replace with actual icon in design polish
    available: false,  // Phase 3
    tooltip: "Coming in Phase 3",
  },
  {
    label: "Test Cases",
    href: (slug: string, key?: string) => key ? `/app/${slug}/${key}/cases` : "#",
    icon: "\u2611",
    available: false,  // Phase 2
    tooltip: "Coming in Phase 2",
  },
  {
    label: "Test Runs",
    href: (slug: string, key?: string) => key ? `/app/${slug}/${key}/runs` : "#",
    icon: "\u25B6",
    available: false,  // Phase 3
    tooltip: "Coming in Phase 3",
  },
] as const

export function Sidebar({ slug, projectKey }: SidebarProps) {
  const router = useRouter()
  const { data: session } = useSession()

  // Persist sidebar state in localStorage (DS-04)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === "true") setCollapsed(true)
  }, [])

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(STORAGE_KEY, String(next))
  }

  return (
    <aside
      className={clsx(
        "flex h-screen flex-col border-r border-gray-200 bg-white transition-all duration-200",
        collapsed ? "w-12" : "w-60"  // 48px collapsed, 240px expanded
      )}
      aria-label="Main navigation"
    >
      {/* Workspace header */}
      <div className="flex h-12 items-center gap-2 border-b border-gray-200 px-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-cobalt text-xs font-bold text-white">
          V
        </div>
        {!collapsed && (
          <span className="truncate text-sm font-semibold text-gray-900">Velo</span>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          className={clsx(
            "ml-auto flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600",
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? "\u203A" : "\u2039"}
        </button>
      </div>

      {/* Navigation items */}
      <nav className="flex-1 overflow-y-auto p-2">
        {NAV_ITEMS.map((item) => {
          const href = item.href(slug, projectKey)
          const isActive = router.asPath === href

          if (!item.available) {
            // Visible but disabled (DS-04 — not hidden)
            return (
              <div
                key={item.label}
                className="flex cursor-not-allowed items-center gap-3 rounded-md px-2 py-1.5 text-gray-300"
                title={collapsed ? `${item.label} \u2014 ${item.tooltip}` : item.tooltip}
                aria-disabled="true"
              >
                <span className="shrink-0 text-base">{item.icon}</span>
                {!collapsed && (
                  <span className="text-sm">{item.label}</span>
                )}
              </div>
            )
          }

          return (
            <Link
              key={item.label}
              href={href}
              className={clsx(
                "flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors",
                isActive
                  ? "bg-cobalt-light text-cobalt font-medium"
                  : "text-gray-700 hover:bg-gray-100",
              )}
              title={collapsed ? item.label : undefined}
            >
              <span className="shrink-0 text-base">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}

        {/* Divider */}
        <div className="my-2 border-t border-gray-100" />

        {/* Settings — active in Phase 1 */}
        <Link
          href={`/app/${slug}/settings`}
          className={clsx(
            "flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors",
            router.asPath.includes("/settings")
              ? "bg-cobalt-light text-cobalt font-medium"
              : "text-gray-700 hover:bg-gray-100"
          )}
          title={collapsed ? "Settings" : undefined}
        >
          <span className="shrink-0 text-base">\u2699</span>
          {!collapsed && <span>Settings</span>}
        </Link>
      </nav>

      {/* User section — sign out */}
      <div className="border-t border-gray-200 p-2">
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className={clsx(
            "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100",
          )}
          title={collapsed ? "Sign out" : undefined}
        >
          <span className="shrink-0 text-base">\u21C4</span>
          {!collapsed && (
            <span className="truncate">{session?.user?.name ?? session?.user?.email ?? "Sign out"}</span>
          )}
        </button>
      </div>
    </aside>
  )
}
