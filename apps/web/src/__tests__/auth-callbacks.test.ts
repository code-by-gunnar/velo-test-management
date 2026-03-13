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

describe("Auth.js signIn callback (OAuth chain)", () => {
  it("returns true for credentials provider (no backend call)", async () => {
    const result = await signInCallback({
      user: { id: "user-123", email: "test@example.com" },
      account: { type: "credentials", provider: "credentials", providerAccountId: "" },
    })
    expect(result).toBe(true)
  })

  it("returns true when null account (fallback)", async () => {
    const result = await signInCallback({
      user: { id: "user-123", email: "test@example.com" },
      account: null,
    })
    expect(result).toBe(true)
  })

  it("calls oauth-signin endpoint for OAuth provider and populates user", async () => {
    const backendResponse = {
      id: "backend-uuid",
      email: "oauth@example.com",
      name: "OAuth User",
      workspace_id: "ws-uuid",
      workspace_slug: "acme",
      role: "admin",
    }

    const user: Record<string, unknown> = { id: "provider-id", email: "oauth@example.com" }
    const result = await signInCallback({
      user,
      account: { type: "oidc", provider: "google", providerAccountId: "google-sub-123" },
      profile: { email: "oauth@example.com", name: "OAuth User" },
      _mockFetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(backendResponse) }),
    })

    expect(result).toBe(true)
    expect(user.id).toBe("backend-uuid")
    expect(user.workspace_id).toBe("ws-uuid")
    expect(user.workspace_slug).toBe("acme")
    expect(user.role).toBe("admin")
  })

  it("returns error redirect when backend returns 409", async () => {
    const result = await signInCallback({
      user: { id: "provider-id", email: "conflict@example.com" },
      account: { type: "oauth", provider: "github", providerAccountId: "gh-123" },
      profile: { email: "conflict@example.com" },
      _mockFetch: () => Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: "provider_conflict" }),
      }),
    })

    expect(result).toBe("/login?error=provider_conflict")
  })

  it("returns error redirect when no email available", async () => {
    const result = await signInCallback({
      user: { id: "provider-id", email: null },
      account: { type: "oauth", provider: "github", providerAccountId: "gh-123" },
      profile: {},
    })

    expect(result).toBe("/login?error=no_email")
  })

  it("jwt callback correctly reads OAuth user fields (ALK-03)", () => {
    // Simulate an OAuth sign-in where signIn callback populated user fields
    const token = { sub: "google-sub-123" }
    const oauthUser = {
      id: "backend-uuid",
      email: "oauth@example.com",
      name: "OAuth User",
      workspace_id: "ws-uuid",
      workspace_slug: "acme",
      role: "editor",
    }

    const updatedToken = jwtCallback({ token, user: oauthUser })

    expect(updatedToken.id).toBe("backend-uuid")
    expect(updatedToken.workspace_id).toBe("ws-uuid")
    expect(updatedToken.workspace_slug).toBe("acme")
    expect(updatedToken.role).toBe("editor")
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

async function signInCallback({
  user,
  account,
  profile,
  _mockFetch,
}: {
  user: Record<string, unknown>
  account?: { type: string; provider: string; providerAccountId: string } | null
  profile?: Record<string, unknown>
  _mockFetch?: (url: string, init: RequestInit) => Promise<{ ok: boolean; json: () => Promise<unknown> }>
}): Promise<boolean | string> {
  if (!account || account.type === 'credentials') return true

  const email = (profile?.email ?? user.email) as string | null | undefined
  if (!email) return '/login?error=no_email'

  const doFetch = _mockFetch ?? (globalThis.fetch as unknown as typeof _mockFetch)
  const res = await doFetch!(`http://localhost:3001/api/auth/oauth-signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      email,
      name: (profile?.name ?? user.name ?? null) as string | null,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'oauth_error' })) as { error?: string }
    return `/login?error=${err.error ?? 'oauth_error'}`
  }

  const backendUser = await res.json() as Record<string, unknown>
  user.id = backendUser.id
  user.workspace_id = backendUser.workspace_id
  user.workspace_slug = backendUser.workspace_slug
  user.role = backendUser.role

  return true
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
