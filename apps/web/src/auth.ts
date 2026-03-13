import NextAuth, { type DefaultSession } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import GitHub from "next-auth/providers/github"
import { z } from "zod"

// ─── TypeScript module augmentation ──────────────────────────────────────────
// Extend the built-in session/JWT types to include custom fields.
// This is the compile-time enforcement layer for AUTH-05.

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      workspace_id: string | null
      workspace_slug: string | null   // stored in JWT so redirects work without API calls
      role: string | null
    } & DefaultSession["user"]
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string
    workspace_id?: string | null
    workspace_slug?: string | null
    role?: string | null
  }
}

// ─── Credentials schema ───────────────────────────────────────────────────────

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

// ─── Auth.js v5 configuration ─────────────────────────────────────────────────

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google,   // OIDC — auto-detects AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET
    GitHub,   // OAuth2 — auto-detects AUTH_GITHUB_ID + AUTH_GITHUB_SECRET, includes user:email scope
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // Validate input shape
        const parsed = credentialsSchema.safeParse(credentials)
        if (!parsed.success) return null

        // Call the Fastify API to verify credentials
        // The API handles bcrypt comparison and returns user + workspace context
        const res = await fetch(`${process.env.API_URL}/api/auth/verify-credentials`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        })

        if (!res.ok) return null

        const user = await res.json() as {
          id: string
          email: string
          name: string | null
          workspace_id: string | null
          workspace_slug: string | null
          role: string | null
        }

        return user
      },
    }),
  ],

  session: { strategy: "jwt" },

  pages: {
    signIn: "/login",
    error: "/auth/error",
  },

  callbacks: {
    // Step 0: signIn callback — resolve OAuth users via Fastify backend
    async signIn({ user, account, profile }) {
      // Credentials provider: authorize() already called Fastify, user is populated
      if (!account || account.type === 'credentials') return true

      // OAuth/OIDC: call Fastify to resolve/provision the user
      const email = profile?.email ?? user.email
      if (!email) return '/login?error=no_email'

      const res = await fetch(`${process.env.API_URL}/api/auth/oauth-signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          email,
          name: profile?.name ?? user.name ?? null,
          image: (profile as Record<string, unknown>)?.picture as string
            ?? (profile as Record<string, unknown>)?.avatar_url as string
            ?? user.image
            ?? null,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'oauth_error' })) as { error?: string }
        return `/login?error=${err.error ?? 'oauth_error'}`
      }

      // Populate user object — jwt callback reads these fields
      const backendUser = await res.json() as {
        id: string
        workspace_id: string | null
        workspace_slug: string | null
        role: string | null
      }
      user.id = backendUser.id
      const u = user as Record<string, unknown>
      u.workspace_id = backendUser.workspace_id
      u.workspace_slug = backendUser.workspace_slug
      u.role = backendUser.role

      return true
    },

    // Step 1: authorize() returns user → jwt callback receives it on first sign-in.
    // Also handles client-side update() calls (trigger === "update") which are used
    // after workspace creation to refresh workspace_id + workspace_slug without re-login.
    jwt({ token, user, trigger, session }) {
      if (user) {
        // user is typed as next-auth's User — cast to access custom fields
        const u = user as { id?: string; workspace_id?: string | null; workspace_slug?: string | null; role?: string | null }
        if (u.id !== undefined) token.id = u.id
        token.workspace_id = u.workspace_id ?? null
        token.workspace_slug = u.workspace_slug ?? null
        token.role = u.role ?? null
      }
      // Called by useSession().update({ ... }) after onboarding wizard or profile edits
      if (trigger === "update" && session) {
        if (session.workspace_id !== undefined) token.workspace_id = session.workspace_id
        if (session.workspace_slug !== undefined) token.workspace_slug = session.workspace_slug
        if (session.role !== undefined) token.role = session.role
        if (session.name !== undefined) token.name = session.name
        if (session.email !== undefined) token.email = session.email
      }
      return token
    },

    // Step 2: jwt callback populates token → session callback exposes fields on session
    session({ session, token }) {
      // Cast session.user to our augmented type to satisfy exactOptionalPropertyTypes.
      // The user object always exists at this point — Auth.js sets it before calling this callback.
      const user = session.user as {
        id: string
        workspace_id: string | null
        workspace_slug: string | null
        role: string | null
        name?: string | null
        email?: string | null
        image?: string | null
      }
      // token.id is set in jwt callback above; fallback to token.sub (Auth.js default user id field)
      user.id = String(token.id ?? token.sub ?? "")
      user.workspace_id = (token.workspace_id as string | null | undefined) ?? null
      user.workspace_slug = (token.workspace_slug as string | null | undefined) ?? null
      user.role = (token.role as string | null | undefined) ?? null
      return session
    },
  },
})
