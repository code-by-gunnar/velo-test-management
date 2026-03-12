import { useState, useEffect, useCallback } from "react"
import { Button, Card, CardHeader, CardTitle } from "@/components/ui"
import { clsx } from "clsx"

interface Member {
  user_id: string
  email: string
  role: "admin" | "editor" | "viewer"
  joined_at: string
}

interface Invitation {
  id: string
  email: string
  role: "admin" | "editor" | "viewer"
  expires_at: string
}

interface TeamPanelProps {
  workspaceId: string
  userRole: string | null
  userId?: string | undefined
}

const ROLE_OPTIONS: Array<{ value: "admin" | "editor" | "viewer"; label: string }> = [
  { value: "admin", label: "Admin" },
  { value: "editor", label: "Editor" },
  { value: "viewer", label: "Viewer" },
]

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        role === "admin" && "border border-primary/20 bg-primary-selected text-primary",
        role === "editor" && "border border-blue-200 bg-blue-50 text-blue-700",
        role === "viewer" && "border border-gray-200 bg-gray-50 text-gray-500"
      )}
    >
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </span>
  )
}

export function TeamPanel({ workspaceId, userRole, userId }: TeamPanelProps) {
  const isAdmin = userRole === "admin"

  // Members state
  const [members, setMembers] = useState<Member[]>([])
  const [membersLoading, setMembersLoading] = useState(true)
  const [membersError, setMembersError] = useState<string | null>(null)

  // Invitations state
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [invitesLoading, setInvitesLoading] = useState(false)

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"admin" | "editor" | "viewer">("viewer")
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)

  // Role change state
  const [changingRoleFor, setChangingRoleFor] = useState<string | null>(null)

  // Deactivate state
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState<string | null>(null)

  // Resend state
  const [resendingId, setResendingId] = useState<string | null>(null)

  const fetchMembers = useCallback(async () => {
    setMembersLoading(true)
    setMembersError(null)
    try {
      const res = await fetch(`/api/backend/workspaces/${workspaceId}/members`)
      if (!res.ok) throw new Error(`Failed to load members (${res.status})`)
      const data = await res.json() as Member[]
      setMembers(data)
    } catch (err) {
      setMembersError(err instanceof Error ? err.message : "Failed to load members")
    } finally {
      setMembersLoading(false)
    }
  }, [workspaceId])

  const fetchInvitations = useCallback(async () => {
    if (!isAdmin) return
    setInvitesLoading(true)
    try {
      const res = await fetch(`/api/backend/workspaces/${workspaceId}/invitations`)
      if (!res.ok) return
      const data = await res.json() as Invitation[]
      setInvitations(data)
    } finally {
      setInvitesLoading(false)
    }
  }, [workspaceId, isAdmin])

  useEffect(() => {
    void fetchMembers()
  }, [fetchMembers])

  useEffect(() => {
    void fetchInvitations()
  }, [fetchInvitations])

  const handleInvite = async () => {
    const email = inviteEmail.trim()
    if (!email) {
      setInviteError("Email is required")
      return
    }
    setInviting(true)
    setInviteError(null)
    setInviteSuccess(null)
    try {
      const res = await fetch(`/api/backend/workspaces/${workspaceId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: inviteRole }),
      })
      if (!res.ok) {
        const body = await res.json() as { message?: string; code?: string }
        if (body.code === "TIER_LIMIT_EXCEEDED") {
          setInviteError("You've reached the member limit on the free tier. Upgrade to add more members.")
        } else {
          throw new Error(body.message ?? `Failed to send invite (${res.status})`)
        }
        return
      }
      setInviteSuccess(`Invitation sent to ${email}`)
      setInviteEmail("")
      setInviteRole("viewer")
      void fetchInvitations()
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to send invitation")
    } finally {
      setInviting(false)
    }
  }

  const handleResend = async (invitation: Invitation) => {
    setResendingId(invitation.id)
    try {
      await fetch(`/api/backend/workspaces/${workspaceId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: invitation.email, role: invitation.role }),
      })
      void fetchInvitations()
    } finally {
      setResendingId(null)
    }
  }

  const handleRoleChange = async (memberId: string, newRole: "admin" | "editor" | "viewer") => {
    setChangingRoleFor(memberId)
    try {
      const res = await fetch(`/api/backend/workspaces/${workspaceId}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      })
      if (!res.ok) {
        const body = await res.json() as { message?: string }
        throw new Error(body.message ?? `Failed to update role (${res.status})`)
      }
      setMembers((prev) =>
        prev.map((m) => (m.user_id === memberId ? { ...m, role: newRole } : m))
      )
    } catch {
      // Re-fetch to sync state on error
      void fetchMembers()
    } finally {
      setChangingRoleFor(null)
    }
  }

  const handleDeactivate = async (memberId: string) => {
    setDeactivatingId(memberId)
    setConfirmDeactivate(null)
    try {
      const res = await fetch(
        `/api/backend/workspaces/${workspaceId}/members/${memberId}/deactivate`,
        { method: "PATCH" }
      )
      if (!res.ok) {
        void fetchMembers()
        return
      }
      setMembers((prev) => prev.filter((m) => m.user_id !== memberId))
    } finally {
      setDeactivatingId(null)
    }
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })

  return (
    <div className="flex flex-col gap-4">
      {/* Invite form — admin only */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Invite a Team Member</CardTitle>
          </CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="invite-email" className="mb-1 block text-xs font-medium text-gray-700">
                Email address
              </label>
              <input
                id="invite-email"
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleInvite()
                }}
                className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="invite-role" className="mb-1 block text-xs font-medium text-gray-700">
                Role
              </label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "admin" | "editor" | "viewer")}
                className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="primary"
              onClick={() => void handleInvite()}
              disabled={inviting}
              className="h-9 px-4"
            >
              {inviting ? "Sending..." : "Send Invite"}
            </Button>
          </div>
          {inviteError && (
            <p className="mt-2 text-sm text-fail-text">{inviteError}</p>
          )}
          {inviteSuccess && (
            <p className="mt-2 text-sm text-pass-text">{inviteSuccess}</p>
          )}
        </Card>
      )}

      {/* Pending invitations — admin only */}
      {isAdmin && !invitesLoading && invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Invitations</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <th className="pb-2 pr-4">Email</th>
                  <th className="pb-2 pr-4">Role</th>
                  <th className="pb-2 pr-4">Expires</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <tr key={inv.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-2.5 pr-4 text-gray-700">{inv.email}</td>
                    <td className="py-2.5 pr-4">
                      <RoleBadge role={inv.role} />
                    </td>
                    <td className="py-2.5 pr-4 text-gray-500">{formatDate(inv.expires_at)}</td>
                    <td className="py-2.5 text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void handleResend(inv)}
                        disabled={resendingId === inv.id}
                      >
                        {resendingId === inv.id ? "Sending..." : "Resend"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Members list */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
        </CardHeader>

        {membersLoading ? (
          <p className="text-sm text-gray-500">Loading members...</p>
        ) : membersError ? (
          <p className="text-sm text-fail-text">{membersError}</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-gray-500">No members found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <th className="pb-2 pr-4">Email</th>
                  <th className="pb-2 pr-4">Role</th>
                  <th className="pb-2 pr-4">Joined</th>
                  {isAdmin && <th className="pb-2" />}
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const isSelf = userId === member.user_id
                  const isConfirming = confirmDeactivate === member.user_id
                  return (
                    <tr key={member.user_id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2.5 pr-4 font-medium text-gray-900">
                        {member.email}
                        {isSelf && (
                          <span className="ml-2 text-xs text-gray-400">(you)</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        {isAdmin && !isSelf ? (
                          <select
                            value={member.role}
                            onChange={(e) =>
                              void handleRoleChange(
                                member.user_id,
                                e.target.value as "admin" | "editor" | "viewer"
                              )
                            }
                            disabled={changingRoleFor === member.user_id}
                            className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                          >
                            {ROLE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <RoleBadge role={member.role} />
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-500">{formatDate(member.joined_at)}</td>
                      {isAdmin && (
                        <td className="py-2.5 text-right">
                          {!isSelf && (
                            <>
                              {isConfirming ? (
                                <div className="flex items-center justify-end gap-2">
                                  <span className="text-xs text-gray-500">Confirm?</span>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => void handleDeactivate(member.user_id)}
                                    disabled={deactivatingId === member.user_id}
                                  >
                                    {deactivatingId === member.user_id ? "Removing..." : "Yes, remove"}
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setConfirmDeactivate(null)}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => setConfirmDeactivate(member.user_id)}
                                >
                                  Deactivate
                                </Button>
                              )}
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
