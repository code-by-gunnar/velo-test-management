# Pitfalls: v1.2 Social Auth (OAuth Integration)

**Project:** Velo v1.2
**Researched:** 2026-03-12
**Scope:** Common mistakes when adding Google + GitHub OAuth to an existing Auth.js v5 credentials-only app
**Overall confidence:** HIGH (Auth.js official docs, GitHub issues, verified patterns)

---

## Critical Pitfalls

### OC1 — Auto-Linking Is Off By Default and Requires a Dangerous Flag

**What goes wrong:** You add Google/GitHub providers and expect Auth.js to silently link them to existing email/password accounts. Instead, users hit the `OAuthAccountNotLinked` error page on every attempt because Auth.js blocks this by default.

**Root cause:** Auth.js v5 deliberately does not auto-link OAuth accounts to existing accounts on email match. The flag to enable it is named `allowDangerousEmailAccountLinking: true` on the provider config — the name "Dangerous" is intentional signaling from the Auth.js team.

**Why it's actually safe in this case:** Google and GitHub are both considered trusted verifiers. Both providers guarantee that the email address in the OAuth profile has been verified before they expose it. The risk (account takeover via unverified email) exists only with providers that return unverified emails. Google's `profile.email_verified` is always `true` for consumer Google accounts; GitHub requires email verification for accounts with passwords set.

**Prevention:**
- Set `allowDangerousEmailAccountLinking: true` on both the Google and GitHub provider configs.
- Inside the `signIn` callback, verify `profile.email_verified === true` before allowing sign-in. For GitHub, this is `profile.email_verified`. For Google, this is also `profile.email_verified`.
- If `email_verified` is false for a profile, return `false` from the signIn callback to block sign-in. Do NOT rely on auto-linking to catch this.

**Detection:** User clicks "Sign in with Google" and is redirected to `/login?error=OAuthAccountNotLinked`.

**Phase:** Implementing OAuth providers (Phase 1 of this milestone)

---

### OC2 — The signIn Callback Is the Only Place to Inject workspace_id into the JWT for OAuth Users

**What goes wrong:** For credentials users, `workspace_id` and `role` are returned from the Fastify `/api/auth/verify-credentials` endpoint and land in the `user` object passed to the `jwt` callback. For OAuth users there is no `authorize()` call — Auth.js calls the `jwt` callback with `user` set to the OAuth profile object, which has no `workspace_id`, `role`, or `id` matching your users table.

The result: OAuth users get a JWT with `workspace_id: null` and `role: null` permanently — not just until onboarding. The existing `requireAuth` guard that checks `session.user.workspace_id` correctly redirects them to onboarding, but if the onboarding flow calls `useSession().update(...)` to write `workspace_id` back, it works. The real danger is if you add the workspace_id lookup directly in the `jwt` callback without using the `signIn` callback — you'll make an API call on every single JWT refresh (every page navigation), not just on sign-in.

**Prevention:**
- In the `signIn` callback, when `account.type === "oauth"`, call the Fastify API to look up (or create) the user by `profile.email`. Return the user's `id`, `workspace_id`, `workspace_slug`, and `role` and attach them to a temporary context.
- In the `jwt` callback, when `account` exists (first sign-in only), read those values and persist them to the token — same as credentials flow.
- The existing `trigger === "update"` path in the `jwt` callback already handles post-onboarding workspace refresh for all user types — this needs no change.

**Detection:** OAuth user signs in, workspace_id is null in every session inspection, and the Fastify API receives `workspace_id: null` on all authorized requests.

**Phase:** JWT callback chain wiring

---

### OC3 — The Custom Pages Router Handler Breaks OAuth Redirects If Body Parsing Logic Is Wrong

**What goes wrong:** The existing `apps/web/src/pages/api/auth/[...nextauth].ts` bridges Auth.js v5's web-standard handlers into the Pages Router using manual body buffering. OAuth sign-in is a GET redirect, not a POST. The current handler routes `POST` → `handlers.POST` and everything else → `handlers.GET`. This is correct. But if the bridge ever loses the raw `Set-Cookie` headers from the Auth.js response (e.g., due to `res.setHeader` receiving a multi-value cookie array as a string), the session cookie is never set and the user appears signed-out after OAuth callback.

**Root cause:** Auth.js sets multiple `Set-Cookie` headers during the OAuth callback (state cookie, nonce cookie, session cookie). `res.setHeader(key, value)` replaces previous values when called multiple times for the same key. The existing code uses `webRes.headers.forEach((value, key) => res.setHeader(key, value))` which is the wrong pattern for `Set-Cookie` — it will silently drop all but the last cookie.

**Prevention:** Change the cookie header forwarding in the Pages Router bridge to accumulate all `Set-Cookie` values into an array:
```typescript
const cookies: string[] = []
webRes.headers.forEach((value, key) => {
  if (key.toLowerCase() === "set-cookie") {
    cookies.push(value)
  } else {
    res.setHeader(key, value)
  }
})
if (cookies.length > 0) res.setHeader("Set-Cookie", cookies)
```
This is a mandatory fix before OAuth can work. The existing handler works for credentials (single session cookie set) but will silently drop state/nonce cookies for OAuth flows.

**Detection:** OAuth callback returns to your app but session is not established. The browser never receives the session cookie. Check Network tab: POST to `/api/auth/callback/google` returns 200 but no `Set-Cookie: authjs.session-token` header.

**Phase:** Handler wiring (must fix before any OAuth test)

---

### OC4 — GitHub Returns null Email for Users With Private Emails

**What goes wrong:** Users who have "Keep my email address private" enabled in GitHub settings return `profile.email = null` from the default OAuth flow. Auth.js cannot match them to an existing account by email (null email cannot match). The sign-in fails silently or creates a duplicate account with no email.

**Root cause:** GitHub's default `user` scope does not guarantee email exposure. Users can opt out. The `user:email` scope fetches from `/user/emails` endpoint and returns the primary email even if private, but this requires explicitly requesting the scope.

**Prevention:**
- Add `authorization: { params: { scope: "read:user user:email" } }` to the GitHub provider config.
- In the `signIn` callback, when `profile.email` is null for a GitHub sign-in, call the GitHub `/user/emails` API using the OAuth `account.access_token` to retrieve the primary verified email.
- If no verified primary email can be found, return `false` from `signIn` and redirect to an error page explaining the issue.

**Detection:** Test with a GitHub account that has "Keep my email address private" enabled. The `profile.email` will be null.

**Phase:** GitHub provider configuration

---

### OC5 — OAuth Callback URL Must Be Registered in Provider Console Before Testing

**What goes wrong:** Google OAuth and GitHub OAuth require the exact redirect URI to be registered in their developer consoles. The default Auth.js callback URL is `[origin]/api/auth/callback/[provider]`. If this URL is not listed in the OAuth app settings, the provider returns `redirect_uri_mismatch` and the user gets a blank error screen from Google/GitHub, not your app.

**Root cause:** OAuth security model — unregistered redirect URIs are rejected by the provider. Different for each environment (local, Railway staging, Vercel production).

**Key details:**
- **Google Cloud Console:** Allows multiple authorized redirect URIs per OAuth Client ID. Add both `http://localhost:3000/api/auth/callback/google` (dev) and `https://velo-test-management.vercel.app/api/auth/callback/google` (prod).
- **GitHub OAuth App:** Only one homepage URL and one callback URL per app. You need separate GitHub OAuth Apps for dev and production. Alternatively, use the "device flow" workaround, but the clean solution is separate apps.
- **Environment variables:** `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` (auto-detected by Auth.js v5 env var inference). `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` similarly.

**Prevention:**
- Create separate GitHub OAuth Apps: one for local dev (callback: `http://localhost:3000/api/auth/callback/github`), one for production (callback: `https://velo-test-management.vercel.app/api/auth/callback/github`).
- Create one Google OAuth Client with both local and production redirect URIs listed.
- Store dev credentials in `.env.local`, production credentials in Vercel environment variables.

**Detection:** After clicking OAuth button, you're immediately redirected back to the provider's error page ("redirect_uri_mismatch" or "The redirect_uri MUST match the registered callback URL for this application").

**Phase:** Provider app registration (before any code is written)

---

### OC6 — GDPR Erasure Does Not Clean Up OAuth Accounts If You Add Them Without a Table

**What goes wrong:** The decision to skip a database adapter and use JWT-only strategy means you will not have an Auth.js-managed `accounts` table. If you implement OAuth linking by recording provider links in your own custom table (`oauth_accounts` or similar), the existing GDPR erasure worker only anonymizes the `users` row. The OAuth link records remain as personal data (they contain `provider_account_id`, email, provider name, potentially `access_token`).

**Root cause:** GDPR erasure was built to target the `users` table (v1.1). OAuth links are new data introduced in v1.2. The erasure worker has no knowledge of them.

**Prevention:**
- Create an `oauth_accounts` table with `ON DELETE CASCADE` on the `user_id` foreign key. This ensures any future `DELETE FROM users WHERE id = $userId` automatically removes linked OAuth records.
- Alternatively, if using `UPDATE users SET email = 'deleted-...'` (anonymization rather than delete), explicitly `DELETE FROM oauth_accounts WHERE user_id = $userId` in the erasure worker.
- Add the cascade to the migration schema, not just the application logic. Schema-level CASCADE is the safety net.

**Detection:** After GDPR erasure of a user who signed in via OAuth, the `oauth_accounts` table still has rows with that user's provider_account_id and access_token.

**Phase:** Schema migration + erasure worker update

---

## Moderate Pitfalls

### OM1 — JWT Token Does Not Reflect Provider Account on Subsequent Visits Without Re-Login

**What goes wrong:** The `user`, `account`, and `profile` objects are only available in the `jwt` callback on the **first sign-in**. On subsequent requests, only `token` is passed. If you fail to write `workspace_id`, `role`, and `id` into the token on first sign-in, those fields will be null forever for that session — there is no recovery path without a logout/login cycle.

**Prevention:** Test the full sign-in → page refresh → sign-out → sign-in again cycle during development. Use browser DevTools to inspect the `authjs.session-token` cookie (it's a JWE but you can decode it with AUTH_SECRET to verify fields are present).

**Detection:** `session.user.workspace_id` is null on the second page load even though the user completed onboarding.

**Phase:** JWT callback wiring

---

### OM2 — The Existing Pages Router Bridge Does Not Forward CORS Headers for OAuth Preflight

**What goes wrong:** The bridge in `[...nextauth].ts` manually forwards headers from the Auth.js response to the Node.js response. OAuth provider callbacks arrive as GET redirects from the browser, not CORS requests, so this is not normally an issue. But if you add an API route that calls Auth.js directly from a different origin (e.g., the Railway API calling the Auth.js endpoint to validate a token), CORS failures will occur because the bridge doesn't set CORS headers.

**Prevention:** This pitfall is not triggered by the current architecture (Railway API decodes the JWE directly without calling Auth.js endpoints). Monitor if this changes.

**Detection:** CORS errors in the Network tab when any cross-origin request hits `/api/auth/*`.

**Phase:** No action needed unless architecture changes

---

### OM3 — Google OAuth Access Token Is Not the Same as the Auth.js Session Token

**What goes wrong:** Developers unfamiliar with OAuth sometimes forward the Google `access_token` (from `account.access_token` in the jwt callback) to the Fastify API as authentication. The Fastify `session.plugin.ts` decodes Auth.js JWE tokens using HKDF-derived keys. It will reject Google access tokens entirely (wrong format, wrong key). This breaks API calls silently.

**Prevention:** Never change the bearer token forwarding in the Next.js gateway (`/api/backend/[...path].ts`). It already correctly forwards the Auth.js session cookie as a Bearer token. The Google `access_token` from the OAuth flow is an implementation detail — never expose it to the Fastify API or the browser.

**Detection:** 401 errors on all API calls after OAuth sign-in, but the user appears signed in on the frontend.

**Phase:** Gateway integration testing

---

### OM4 — The signIn Callback Can Silently Block Sign-In Without an Error Message

**What goes wrong:** When the `signIn` callback returns `false`, Auth.js redirects to `/login?error=AccessDenied` by default. The existing error handling on the login page shows a generic error. Users who are blocked (e.g., GitHub returned null email) see "Access denied" with no explanation.

**Prevention:** Return a string URL from `signIn` to redirect to a custom error page with a descriptive message. For example: `return "/login?error=oauth_no_email"` for the null-email case. Handle `?error=oauth_no_email` in the login page to show "Your GitHub account has private email settings. Please make your primary email visible to use GitHub sign-in."

**Detection:** Users report generic "Access denied" with no actionable message.

**Phase:** Login page error handling

---

### OM5 — Valkey Deactivation Blocklist Does Not Fire for New OAuth Sessions of a Deactivated User

**What goes wrong:** The Valkey blocklist key is `deactivated:{workspaceId}:{userId}`. The session plugin checks this on every request. If a user is deactivated while logged in via credentials, their session is invalidated immediately (GC1 from GDPR pitfalls). But if they were never logged in and then sign in for the first time via OAuth after deactivation, the blocklist check happens AFTER the JWT is created and the session established. The first request after OAuth sign-in would be blocked by the Valkey check, so sessions are short-lived. However, the sign-in itself succeeds and creates a session cookie.

**Prevention:** In the `signIn` callback for OAuth sign-ins, after looking up the user by email in your Fastify API, check if the user's `is_active` flag is false. If they're deactivated, return `false` from `signIn` to block session creation entirely.

**Detection:** A deactivated user can complete OAuth sign-in and receives a session cookie, but is then blocked on the first API call. The session cookie exists but all API requests return 401.

**Phase:** signIn callback user lookup

---

## Minor Pitfalls

### OMi1 — Environment Variable Name Changes in Auth.js v5

**What goes wrong:** The old `NEXTAUTH_SECRET` and `NEXTAUTH_URL` env var names still work in v5 but the canonical names are `AUTH_SECRET` and `AUTH_URL`. Mixing old and new names across `.env.local` and Railway/Vercel causes subtle issues where local dev works but production fails (or vice versa).

**Prevention:** Use `AUTH_SECRET` consistently. Use `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` — these are auto-detected by Auth.js v5 without any explicit config. Document all required env vars in `.env.example` with the v5 names only.

---

### OMi2 — Google OAuth Requires consent Prompt for Refresh Token

**What goes wrong:** If you store the Google `refresh_token` in the JWT (for future use, e.g., Google Calendar or Drive integration), it's only returned on the first OAuth flow. Subsequent sign-ins return `access_token` only if `prompt: "consent"` is not set. In the context of Velo v1.2, you don't need the refresh token — you only need the email and basic profile. But if you accidentally store `account.access_token` thinking it's persistent, it will expire in ~1 hour and become useless.

**Prevention:** Do not store `account.access_token` in the JWT for this milestone. You only need `profile.email`, `profile.name`, and `profile.image` from the OAuth profile. The Auth.js session is the authentication mechanism — not the Google access token.

---

### OMi3 — OAuth User Sign-In Creates a User Row Without a Password Hash

**What goes wrong:** OAuth users who sign up via Google/GitHub will have a row in the `users` table with `password_hash = NULL`. This is correct and expected. The danger is if any code path in the Fastify API assumes `password_hash` is always present (e.g., a password change route that reads `password_hash` and tries `bcrypt.compare`).

**Prevention:** Audit all routes that read or write `password_hash`. Any route that handles password change/reset must handle the `NULL` case and return a meaningful error ("This account uses Google sign-in. Password change is not available.").

---

### OMi4 — Auth.js v5 Beta Version Pinning

**What goes wrong:** The project uses `next-auth@5.0.0-beta.30`. Auth.js v5 has been in beta for an extended period and breaking changes have occurred between beta versions. Installing `latest` of `next-auth@5` (or `@latest`) may pull in a newer beta that breaks the existing `session.plugin.ts` HKDF key derivation or cookie name assumptions.

**Prevention:** Pin to `next-auth@5.0.0-beta.30` (the version currently in use). Update only intentionally. Before updating, check the changelog for cookie name changes, JWE algorithm changes, or HKDF derivation changes — any of these would break the Fastify `session.plugin.ts` and require a matching update.

**Detection:** After an accidental `pnpm update`, all authenticated API calls return 401 because the Fastify session plugin can no longer decrypt the new JWE format.

---

## "Looks Done But Isn't" Checklist

Before shipping OAuth, verify each of these manually — they all look done but have common silent failure modes:

- [ ] **Set-Cookie forwarding**: Browser receives ALL three cookies after OAuth callback (`state`, `nonce`, and `session-token`). Check Network tab on the `/api/auth/callback/google` response — it must have 3+ `Set-Cookie` headers.
- [ ] **workspace_id in JWT**: After OAuth sign-in and onboarding, call the API with the session token. The Fastify API must receive a non-null `workspace_id` and return workspace data.
- [ ] **GitHub private email**: Test with a GitHub account that has private emails enabled. Sign-in must either succeed (if `user:email` scope was added and primary email retrieved) or fail with a user-friendly message (not a blank Auth.js error page).
- [ ] **Deactivated user OAuth**: Deactivate a user in the DB, then attempt OAuth sign-in with their Google/GitHub email. Sign-in must be blocked at the `signIn` callback level.
- [ ] **Existing email/password user links correctly**: Create a credentials account, then sign in with Google OAuth using the same email. The result must be one user row, not two. The session must reflect the existing `workspace_id`.
- [ ] **GDPR erasure removes OAuth records**: Create an OAuth user, request erasure, confirm the `oauth_accounts` table is cleaned up.
- [ ] **Callback URL registered for production**: Deploy to Vercel, attempt OAuth sign-in. If it fails with `redirect_uri_mismatch`, the Vercel URL was not registered in the provider console.
- [ ] **JWT module augmentation still covers OAuth**: After adding OAuth providers, run `pnpm typecheck`. The `workspace_id` and `role` fields must still be present on the `JWT` interface — confirm via `declare module "@auth/core/jwt"` in `auth.ts`.

---

## Phase Mapping Summary

| Pitfall | Phase / Task |
|---------|-------------|
| OC1 (Auto-linking flag + email_verified check) | Provider config |
| OC2 (workspace_id injection for OAuth users) | JWT callback chain |
| OC3 (Pages Router bridge Set-Cookie bug) | Handler fix — before any OAuth test |
| OC4 (GitHub null email) | GitHub provider config + signIn callback |
| OC5 (Callback URL registration) | Provider console setup — before coding |
| OC6 (GDPR erasure gap) | Schema migration + erasure worker |
| OM1 (JWT fields lost on refresh) | JWT callback testing |
| OM2 (CORS headers) | Monitor only |
| OM3 (Wrong bearer token forwarded) | Gateway integration testing |
| OM4 (Silent signIn block) | Login page error handling |
| OM5 (Deactivated user OAuth) | signIn callback user lookup |
| OMi1 (Env var naming) | Environment setup |
| OMi2 (Google refresh token) | Don't store access_token |
| OMi3 (NULL password_hash) | Audit password routes |
| OMi4 (Beta version pin) | Dependency management |

---

*Sources: Auth.js v5 official docs (authjs.dev), next-auth FAQ (next-auth.js.org/faq), Auth.js errors reference (authjs.dev/reference/core/errors), GitHub issues #519 OAuthAccountNotLinked, #374 GitHub null email, discussion #3171 account linking security, discussion #8843 allowDangerousEmailAccountLinking, GitHub REST API docs for user:email scope, Auth.js deployment guide (authjs.dev/getting-started/deployment)*
