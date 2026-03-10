import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/router"
import { signOut, useSession } from "next-auth/react"
import { clsx } from "clsx"
import { useCallback, useSyncExternalStore } from "react"

interface SidebarProps {
  slug: string
  projectKey?: string
}

const STORAGE_KEY = "velo:sidebar-collapsed"
const PROJECT_KEY_STORAGE = "velo:last-project-key"

const NAV_ITEMS = [
  {
    label: "Test Cases",
    href: (slug: string, key?: string) => key ? `/app/${slug}/${key}/cases` : "#",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
    available: true,
  },
  {
    label: "Test Runs",
    href: (slug: string, key?: string) => key ? `/app/${slug}/${key}/runs` : "#",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 5.5l4.5 2.5L6 10.5V5.5z" fill="currentColor" />
      </svg>
    ),
    available: true,
  },
  {
    label: "Reports",
    href: (slug: string, key?: string) => key ? `/app/${slug}/${key}/reports` : "#",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M2 12h2V8H2v4zm3 0h2V5H5v7zm3 0h2V2H8v10zm3 0h2V7h-2v5z" fill="currentColor" />
      </svg>
    ),
    available: false,
    tooltip: "Coming in a future phase",
  },
] as const

export function Sidebar({ slug, projectKey }: SidebarProps) {
  const router = useRouter()
  const { data: session } = useSession()

  const subscribeStorage = useCallback((cb: () => void) => {
    window.addEventListener("storage", cb)
    return () => window.removeEventListener("storage", cb)
  }, [])

  const collapsed = useSyncExternalStore(
    subscribeStorage,
    () => localStorage.getItem(STORAGE_KEY) === "true",
    () => false,
  )

  const storedProjectKey = useSyncExternalStore(
    subscribeStorage,
    () => localStorage.getItem(PROJECT_KEY_STORAGE),
    () => null,
  )

  if (projectKey && typeof window !== "undefined") {
    localStorage.setItem(PROJECT_KEY_STORAGE, projectKey)
  }

  const effectiveProjectKey = projectKey ?? storedProjectKey ?? undefined

  const toggleCollapsed = () => {
    localStorage.setItem(STORAGE_KEY, String(!collapsed))
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }))
  }

  const displayName = session?.user?.name ?? session?.user?.email ?? ""
  const initials = displayName
    ? displayName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?"

  return (
    <aside
      className={clsx(
        "flex h-screen shrink-0 flex-col border-r border-gray-200 bg-white transition-all duration-200",
        collapsed ? "w-12" : "w-60"
      )}
      aria-label="Main navigation"
    >
      {/* Workspace header */}
      <div className={clsx(
        "flex h-12 shrink-0 items-center border-b border-gray-200",
        collapsed ? "justify-center px-1" : "gap-2.5 px-3"
      )}>
        {!collapsed && (
          <>
            <Image src="/velo-mark-cobalt.svg" alt="Velo" width={28} height={28} className="shrink-0" />
            <span className="flex-1 truncate text-sm font-semibold text-gray-900">Velo</span>
          </>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            {collapsed ? (
              <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
        </button>
      </div>

      {/* Project context pill — shown when inside a project */}
      {!collapsed && effectiveProjectKey && (
        <div className="border-b border-gray-100 px-3 py-2">
          <div className="flex items-center gap-2 rounded-md bg-mist px-2 py-1.5">
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-cobalt/10 text-[10px] font-bold text-cobalt">
              {effectiveProjectKey.slice(0, 2).toUpperCase()}
            </div>
            <span className="truncate font-mono text-xs font-medium text-gray-700 uppercase tracking-wide">
              {effectiveProjectKey}
            </span>
          </div>
        </div>
      )}

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-2 py-2" aria-label="Project navigation">
        {NAV_ITEMS.map((item) => {
          const href = item.href(slug, effectiveProjectKey)
          const isActive = router.asPath === href

          if (!item.available) {
            return (
              <div
                key={item.label}
                title={collapsed ? `${item.label}${("tooltip" in item && item.tooltip) ? ` — ${item.tooltip as string}` : ""}` : (("tooltip" in item && item.tooltip) ? item.tooltip as string : undefined)}
                aria-disabled="true"
                className={clsx(
                  "flex cursor-not-allowed items-center gap-2.5 rounded-md py-1.5 text-sm text-gray-300",
                  collapsed ? "justify-center px-2" : "pl-2 pr-2 border-l-[3px] border-transparent"
                )}
              >
                <span className="shrink-0">{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </div>
            )
          }

          return (
            <Link
              key={item.label}
              href={href}
              title={collapsed ? item.label : undefined}
              className={clsx(
                "flex items-center gap-2.5 rounded-md py-1.5 text-sm transition-colors",
                collapsed ? "justify-center px-2" : "pr-2",
                isActive
                  ? "border-l-[3px] border-cobalt bg-cobalt/5 text-cobalt font-medium pl-[5px]"
                  : "border-l-[3px] border-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900 pl-2"
              )}
            >
              <span className="shrink-0">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}

        <div className="my-2 border-t border-gray-100" />

        {/* Settings */}
        <Link
          href={`/app/${slug}/settings`}
          title={collapsed ? "Settings" : undefined}
          className={clsx(
            "flex items-center gap-2.5 rounded-md py-1.5 text-sm transition-colors",
            collapsed ? "justify-center px-2" : "pr-2",
            router.asPath.includes("/settings")
              ? "border-l-[3px] border-cobalt bg-cobalt/5 text-cobalt font-medium pl-[5px]"
              : "border-l-[3px] border-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900 pl-2"
          )}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
            <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.42 1.42M11.53 11.53l1.42 1.42M3.05 12.95l1.42-1.42M11.53 4.47l1.42-1.42"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {!collapsed && <span>Settings</span>}
        </Link>
      </nav>

      {/* User section */}
      <div className="border-t border-gray-200 p-2">
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          title={collapsed ? (displayName || "Sign out") : undefined}
          className={clsx(
            "flex w-full items-center gap-2.5 rounded-md py-1.5 text-sm text-gray-600 hover:bg-gray-100 transition-colors",
            collapsed ? "justify-center px-2" : "px-2"
          )}
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-semibold text-gray-600">
            {initials}
          </div>
          {!collapsed && (
            <span className="flex-1 truncate text-left text-xs">{displayName || "Sign out"}</span>
          )}
        </button>
      </div>
    </aside>
  )
}
