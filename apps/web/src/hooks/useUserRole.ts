import { useSession } from "next-auth/react"

export function useUserRole() {
  const { data: session } = useSession()
  const role = session?.user?.role ?? "viewer" // default to most restrictive

  return {
    role,
    canEdit: role === "admin" || role === "editor",
    isAdmin: role === "admin",
  }
}
