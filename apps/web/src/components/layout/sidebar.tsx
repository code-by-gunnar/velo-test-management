import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/router"
import { signOut, useSession } from "next-auth/react"
import { clsx } from "clsx"
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useUserRole } from "@/hooks/useUserRole"
import { CreateProjectModal } from "@/components/projects/CreateProjectModal"
import {
  LayoutGrid,
  Play,
  BarChart3,
  Download,
  Settings,
  Settings2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LogOut,
  User,
  Plus,
  Check,
} from "lucide-react"

interface SidebarProps {
  slug: string
  projectKey?: string
}

const STORAGE_KEY = "velo:sidebar-collapsed"
const PROJECT_KEY_STORAGE = "velo:last-project-key"

const ICON_SIZE = 18

const NAV_ITEMS = [
  {
    label: "Test Cases",
    href: (slug: string, key?: string) => key ? `/app/${slug}/${key}/cases` : "#",
    icon: <LayoutGrid size={ICON_SIZE} />,
    available: true,
  },
  {
    label: "Test Runs",
    href: (slug: string, key?: string) => key ? `/app/${slug}/${key}/runs` : "#",
    icon: <Play size={ICON_SIZE} />,
    available: true,
  },
  {
    label: "Reports",
    href: (slug: string, key?: string) => key ? `/app/${slug}/${key}/reports` : "#",
    icon: <BarChart3 size={ICON_SIZE} />,
    available: false,
    tooltip: "Coming in a future phase",
  },
] as const

export function Sidebar({ slug, projectKey }: SidebarProps) {
  const router = useRouter()
  const { data: session } = useSession()
  const { canEdit, isAdmin } = useUserRole()
  const [createModalOpen, setCreateModalOpen] = useState(false)

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
    <>
    <aside
      className={clsx(
        "flex h-screen shrink-0 flex-col border-r border-gray-200 bg-white transition-all duration-200",
        collapsed ? "w-sidebar-collapsed" : "w-sidebar"
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
            <span className="flex-1 truncate text-base font-bold text-gray-900 font-display">Velo</span>
          </>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Project switcher dropdown */}
      <ProjectSwitcher
        slug={slug}
        collapsed={collapsed}
        effectiveProjectKey={effectiveProjectKey}
        canEdit={canEdit}
        workspaceId={session?.user?.workspace_id ?? ""}
        onNewProjectClick={() => setCreateModalOpen(true)}
      />

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-3 py-2" aria-label="Project navigation">
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
                  "flex cursor-not-allowed items-center gap-2.5 rounded-md py-1.5 text-sm text-gray-400",
                  collapsed ? "justify-center px-2" : "px-3"
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
                collapsed ? "justify-center px-2" : "px-3",
                isActive
                  ? "bg-primary-selected text-primary font-semibold"
                  : "text-gray-800 hover:bg-gray-100"
              )}
            >
              <span className={clsx("shrink-0", isActive ? "text-primary" : "text-gray-500")}>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}

        <div className="my-3 border-t border-gray-200" />

        {/* Ingestion */}
        {effectiveProjectKey && (
          canEdit ? (
            <Link
              href={`/app/${slug}/${effectiveProjectKey}/ingestion`}
              title={collapsed ? "Ingestion" : undefined}
              className={clsx(
                "flex items-center gap-2.5 rounded-md py-1.5 text-sm transition-colors",
                collapsed ? "justify-center px-2" : "px-3",
                router.asPath.includes("/ingestion")
                  ? "bg-primary-selected text-primary font-semibold"
                  : "text-gray-800 hover:bg-gray-100"
              )}
            >
              <Download size={ICON_SIZE} className={clsx("shrink-0", router.asPath.includes("/ingestion") ? "text-primary" : "text-gray-500")} />
              {!collapsed && <span>Ingestion</span>}
            </Link>
          ) : (
            <span
              title={collapsed ? "Ingestion — Editor access required" : "Editor access required"}
              className={clsx(
                "flex items-center gap-2.5 rounded-md py-1.5 text-sm text-gray-400 opacity-50 cursor-default",
                collapsed ? "justify-center px-2" : "px-3"
              )}
            >
              <Download size={ICON_SIZE} className="shrink-0" />
              {!collapsed && <span>Ingestion</span>}
            </span>
          )
        )}

        {/* Project Settings */}
        {effectiveProjectKey && (
          canEdit ? (
            <Link
              href={`/app/${slug}/${effectiveProjectKey}/settings`}
              title={collapsed ? "Project Settings" : undefined}
              className={clsx(
                "flex items-center gap-2.5 rounded-md py-1.5 text-sm transition-colors",
                collapsed ? "justify-center px-2" : "px-3",
                router.asPath.includes(`/${effectiveProjectKey}/settings`)
                  ? "bg-primary-selected text-primary font-semibold"
                  : "text-gray-800 hover:bg-gray-100"
              )}
            >
              <Settings2 size={ICON_SIZE} className={clsx("shrink-0", router.asPath.includes(`/${effectiveProjectKey}/settings`) ? "text-primary" : "text-gray-500")} />
              {!collapsed && <span>Project Settings</span>}
            </Link>
          ) : (
            <span
              title={collapsed ? "Project Settings — Editor access required" : "Editor access required"}
              className={clsx(
                "flex items-center gap-2.5 rounded-md py-1.5 text-sm text-gray-400 opacity-50 cursor-default",
                collapsed ? "justify-center px-2" : "px-3"
              )}
            >
              <Settings2 size={ICON_SIZE} className="shrink-0" />
              {!collapsed && <span>Project Settings</span>}
            </span>
          )
        )}

        <div className="my-3 border-t border-gray-200" />

        {/* Workspace Settings */}
        {isAdmin ? (
          <Link
            href={`/app/${slug}/settings`}
            title={collapsed ? "Settings" : undefined}
            className={clsx(
              "flex items-center gap-2.5 rounded-md py-1.5 text-sm transition-colors",
              collapsed ? "justify-center px-2" : "px-3",
              router.asPath === `/app/${slug}/settings`
                ? "bg-primary-selected text-primary font-semibold"
                : "text-gray-800 hover:bg-gray-100"
            )}
          >
            <Settings size={ICON_SIZE} className={clsx("shrink-0", router.asPath === `/app/${slug}/settings` ? "text-primary" : "text-gray-500")} />
            {!collapsed && <span>Workspace Settings</span>}
          </Link>
        ) : (
          <span
            title={collapsed ? "Workspace Settings — Admin access required" : "Admin access required"}
            className={clsx(
              "flex items-center gap-2.5 rounded-md py-1.5 text-sm text-gray-400 opacity-50 cursor-default",
              collapsed ? "justify-center px-2" : "px-3"
            )}
          >
            <Settings size={ICON_SIZE} className="shrink-0" />
            {!collapsed && <span>Workspace Settings</span>}
          </span>
        )}
      </nav>

      {/* User section */}
      <UserMenu
        slug={slug}
        collapsed={collapsed}
        initials={initials}
        displayName={displayName}
      />
    </aside>
    <CreateProjectModal
      open={createModalOpen}
      onClose={() => setCreateModalOpen(false)}
      workspaceId={session?.user?.workspace_id ?? ""}
      slug={slug}
    />
    </>
  )
}

// ── User popover menu ─────────────────────────────────────────────────────────

function UserMenu({
  slug,
  collapsed,
  initials,
  displayName,
}: {
  slug: string
  collapsed: boolean
  initials: string
  displayName: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Fetch avatar URL once on mount
  useEffect(() => {
    fetch("/api/backend/me/avatar-url")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { url: string | null } | null) => {
        if (data?.url) setAvatarUrl(data.url)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const avatar = avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl}
      alt=""
      className="h-6 w-6 shrink-0 rounded-sm object-cover"
    />
  ) : (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-primary text-[10px] font-semibold text-white">
      {initials}
    </div>
  )

  return (
    <div className="relative border-t border-gray-200 p-2" ref={menuRef}>
      {open && (
        <div className="absolute bottom-full left-2 right-2 mb-1 rounded-lg border border-gray-200 bg-white py-1 shadow-card">
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              void router.push(`/app/${slug}/profile`)
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <User size={14} className="text-gray-400" />
            Profile
          </button>
          <div className="mx-2 my-1 border-t border-gray-100" />
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <LogOut size={14} className="text-gray-400" />
            Sign out
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={collapsed ? (displayName || "Menu") : undefined}
        className={clsx(
          "flex w-full items-center gap-2.5 rounded-md py-1.5 text-sm text-gray-800 hover:bg-gray-100 transition-colors",
          collapsed ? "justify-center px-2" : "px-2"
        )}
      >
        {avatar}
        {!collapsed && (
          <span className="flex-1 truncate text-left text-xs text-gray-600">{displayName || "Menu"}</span>
        )}
      </button>
    </div>
  )
}

// ── Project switcher dropdown ─────────────────────────────────────────────────

function ProjectSwitcher({
  slug,
  collapsed,
  effectiveProjectKey,
  canEdit,
  workspaceId,
  onNewProjectClick,
}: {
  slug: string
  collapsed: boolean
  effectiveProjectKey: string | undefined
  canEdit: boolean
  workspaceId: string
  onNewProjectClick?: () => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<Array<{ id: string; name: string; project_key: string }>>([])
  const menuRef = useRef<HTMLDivElement>(null)

  // Fetch projects on mount and when projects change
  const fetchProjects = useCallback(() => {
    if (!workspaceId) return
    fetch(`/api/backend/workspaces/${workspaceId}/projects`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Array<{ id: string; name: string; project_key: string }> | null) => {
        if (data) setProjects(data)
      })
      .catch(() => {})
  }, [workspaceId])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  // Re-fetch when a project is updated (settings page dispatches this)
  useEffect(() => {
    function handleProjectUpdate() { fetchProjects() }
    window.addEventListener("velo:project-updated", handleProjectUpdate)
    return () => window.removeEventListener("velo:project-updated", handleProjectUpdate)
  }, [fetchProjects])

  // Click-outside handler
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  // Escape key handler
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open])

  const currentProject = projects.find((p) => p.project_key === effectiveProjectKey)

  function handleProjectClick(projectKey: string) {
    localStorage.setItem(PROJECT_KEY_STORAGE, projectKey)
    window.dispatchEvent(new StorageEvent("storage", { key: PROJECT_KEY_STORAGE }))
    setOpen(false)
    void router.push(`/app/${slug}/${projectKey}/cases`)
  }

  return (
    <div className="relative px-3 py-3" ref={menuRef}>
      {!collapsed && (
        <p className="mb-1.5 truncate px-1 text-xs font-medium text-gray-400">{slug}</p>
      )}
      {open && (
        <div
          className={clsx(
            "absolute z-50 rounded-lg border border-gray-200 bg-white py-1 shadow-dropdown",
            collapsed
              ? "left-full top-0 ml-2 w-56"
              : "left-2 right-2 top-full mt-1"
          )}
        >
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => handleProjectClick(project.project_key)}
              className={clsx(
                "flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors",
                project.project_key === effectiveProjectKey
                  ? "bg-primary-selected text-primary font-medium"
                  : "text-gray-700 hover:bg-gray-50"
              )}
            >
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-gray-200 text-[9px] font-semibold text-gray-600">
                {project.name.slice(0, 2).toUpperCase()}
              </div>
              <span className="flex-1 truncate text-left">{project.name}</span>
              {project.project_key === effectiveProjectKey && (
                <Check size={14} className="shrink-0 text-primary" />
              )}
            </button>
          ))}

          {canEdit && (
            <>
              <div className="mx-2 my-1 border-t border-gray-100" />
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onNewProjectClick?.()
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <Plus size={14} className="text-gray-400" />
                New project
              </button>
            </>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={collapsed ? (currentProject?.name || slug) : undefined}
        className={clsx(
          "flex w-full items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 transition-colors hover:bg-gray-200",
          collapsed && "justify-center"
        )}
      >
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-primary text-[10px] font-semibold text-white">
          {slug.slice(0, 2).toUpperCase()}
        </div>
        {!collapsed && (
          <>
            <span className="flex-1 truncate text-left text-sm font-semibold text-gray-800">
              {currentProject?.name || (projects.length > 0 ? effectiveProjectKey : "\u00A0")}
            </span>
            <ChevronDown
              size={14}
              className={clsx(
                "shrink-0 text-gray-500 transition-transform",
                open && "rotate-180"
              )}
            />
          </>
        )}
      </button>
    </div>
  )
}
