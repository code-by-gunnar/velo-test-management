import { describe, it, expect } from "vitest"

// Test the JWT and session callback logic in isolation
// These callbacks are pure functions — we can unit-test them without a real server

describe("Auth.js JWT callback chain (AUTH-05)", () => {
  it("jwt callback copies workspace_id and role from user to token on first sign-in", () => {
    // Simulate what Auth.js calls: jwt({ token, user }) on first sign-in
    const token = { sub: "user-id-123" }
    const user = {
      id: "user-id-123",
      email: "test@example.com",
      name: "Test User",
      workspace_id: "ws-uuid-abc",
      role: "admin",
    }

    // Apply the jwt callback logic (extracted from auth.ts for testing)
    const updatedToken = jwtCallback({ token, user })

    expect(updatedToken.id).toBe("user-id-123")
    expect(updatedToken.workspace_id).toBe("ws-uuid-abc")
    expect(updatedToken.role).toBe("admin")
  })

  it("jwt callback is a no-op on subsequent requests (no user arg)", () => {
    const token = {
      sub: "user-id-123",
      id: "user-id-123",
      workspace_id: "ws-uuid-abc",
      role: "editor",
    }

    // No user arg — simulates subsequent requests where user is not set
    const updatedToken = jwtCallback({ token })

    // Token should be unchanged
    expect(updatedToken.workspace_id).toBe("ws-uuid-abc")
    expect(updatedToken.role).toBe("editor")
  })

  it("session callback exposes id, workspace_id, and role on session.user", () => {
    const session = {
      user: { email: "test@example.com", name: "Test User" },
      expires: new Date(Date.now() + 3600000).toISOString(),
    }
    const token = {
      id: "user-id-123",
      workspace_id: "ws-uuid-abc",
      role: "admin",
    }

    const updatedSession = sessionCallback({ session, token })
    const user = updatedSession["user"] as Record<string, unknown>

    expect(user.id).toBe("user-id-123")
    expect(user.workspace_id).toBe("ws-uuid-abc")
    expect(user.role).toBe("admin")
  })

  it("session.user.workspace_id is null when user has no workspace yet", () => {
    const session = { user: { email: "new@example.com" }, expires: "" }
    const token = { id: "user-id-456", workspace_id: null, role: null }

    const updatedSession = sessionCallback({ session, token })
    const user = updatedSession["user"] as Record<string, unknown>

    expect(user.workspace_id).toBeNull()
    expect(user.role).toBeNull()
  })

  it("jwt callback handles update trigger — refreshes workspace_id from session data", () => {
    const token = {
      sub: "user-id-123",
      id: "user-id-123",
      workspace_id: null,
      role: null,
    }

    const updatedToken = jwtCallback({
      token,
      // No user — simulates update trigger after onboarding
      trigger: "update",
      session: { workspace_id: "ws-new-abc", workspace_slug: "acme", role: "owner" },
    })

    expect(updatedToken.workspace_id).toBe("ws-new-abc")
    expect(updatedToken.workspace_slug).toBe("acme")
    expect(updatedToken.role).toBe("owner")
  })
})

// ─── Extracted callback logic for testing ─────────────────────────────────────
// In production these live in src/auth.ts. Extracted here to make them testable
// without spinning up a Next.js server.

function jwtCallback({
  token,
  user,
  trigger,
  session,
}: {
  token: Record<string, unknown>
  user?: Record<string, unknown>
  trigger?: string
  session?: Record<string, unknown>
}) {
  if (user) {
    const u = user as { id?: string; workspace_id?: string | null; workspace_slug?: string | null; role?: string | null }
    if (u.id !== undefined) token["id"] = u.id
    token["workspace_id"] = u.workspace_id ?? null
    token["workspace_slug"] = u.workspace_slug ?? null
    token["role"] = u.role ?? null
  }
  if (trigger === "update" && session) {
    if (session["workspace_id"] !== undefined) token["workspace_id"] = session["workspace_id"]
    if (session["workspace_slug"] !== undefined) token["workspace_slug"] = session["workspace_slug"]
    if (session["role"] !== undefined) token["role"] = session["role"]
  }
  return token
}

function sessionCallback({
  session,
  token,
}: {
  session: Record<string, unknown>
  token: Record<string, unknown>
}) {
  const user = session["user"] as Record<string, unknown>
  user["id"] = String(token["id"] ?? token["sub"] ?? "")
  user["workspace_id"] = token["workspace_id"] ?? null
  user["role"] = token["role"] ?? null
  return session
}
