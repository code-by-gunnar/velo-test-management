import { describe, it, vi } from "vitest"

// Mock email queue to avoid real BullMQ connections
vi.mock("../../queues/email.queue.js", () => ({
  emailQueue: { add: vi.fn().mockResolvedValue({ id: "mock-job-id" }) },
}))

// Set required env vars
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"
process.env.WEB_URL = process.env.WEB_URL ?? "http://localhost:3000"

describe("Members routes (USR-01 through USR-06)", () => {
  // USR-01: Workspace admin can invite team members by email
  describe("POST /api/workspaces/:workspaceId/invitations (USR-01)", () => {
    it.todo("returns 201 and queues invite email when admin invites valid email")
    it.todo("returns 403 when non-admin tries to invite")
    it.todo("returns 409 when inviting email that is already an active member")
    it.todo("invalidates previous pending invite for same email on re-invite")
  })

  // USR-02: Invited user receives email with sign-up/join link
  describe("POST /api/workspaces/:workspaceId/invitations/accept (USR-02)", () => {
    it.todo("returns 200 and adds user to workspace_members when token is valid")
    it.todo("returns 400 when token is expired")
    it.todo("returns 400 when token is invalid")
    it.todo("returns 409 when user is already a member")
  })

  // USR-03: Admin can assign/change roles
  describe("PATCH /api/workspaces/:workspaceId/members/:userId (USR-03)", () => {
    it.todo("returns 200 and updates role when admin changes member role")
    it.todo("returns 403 when non-admin tries to change role")
    it.todo("busts Valkey role cache on role change")
  })

  // USR-04: Admin can deactivate a team member
  describe("PATCH /api/workspaces/:workspaceId/members/:userId/deactivate (USR-04)", () => {
    it.todo("returns 200 and sets is_active=false when admin deactivates member")
    it.todo("sets Valkey blocklist key on deactivation")
    it.todo("returns 403 when non-admin tries to deactivate")
    it.todo("returns 400 when admin tries to deactivate themselves")
  })

  // USR-05: Viewer seats unlimited, editor seats capped
  describe("Editor seat cap (USR-05)", () => {
    it.todo("allows unlimited viewer invitations on free tier")
    it.todo("rejects editor invitation when free tier cap reached")
    it.todo("rejects role upgrade to editor when free tier cap reached")
  })

  // USR-06: Plan tier limits enforced at API layer
  describe("Tier limit enforcement (USR-06)", () => {
    it.todo("returns 403 with TIER_LIMIT_EXCEEDED when editor cap exceeded")
    it.todo("error includes upgrade prompt message")
  })
})
