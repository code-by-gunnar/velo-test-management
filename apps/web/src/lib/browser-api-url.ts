// Resolve the browser-facing API base URL — the host the *browser* connects to
// directly, bypassing the /api/backend gateway: SSE EventSource streams and the
// CI ingestion command the UI displays.
//
// This is called from getServerSideProps (server-side, per request), so it reads
// RUNTIME env. Crucially it must NOT be a bare `process.env.NEXT_PUBLIC_*`
// reference: Next inlines those at BUILD time, which froze the prebuilt image to
// the Dockerfile default `http://localhost:3001` and made SSE unreachable for
// every self-hoster regardless of the runtime value they set. Reading fields off
// the passed-in env object (not the literal member expression) keeps all three
// runtime-resolved.
//
// Precedence:
//   1. PUBLIC_API_URL          — the plain runtime var self-hosters set to their
//      public HTTPS API origin (e.g. https://api.example.com). Works with the
//      prebuilt GHCR image, no rebuild. This is the one to use.
//   2. NEXT_PUBLIC_API_BASE_URL — legacy/back-compat for images built from source
//      with the build ARG baked in.
//   3. API_URL                 — last resort (compose-internal http://api:3001;
//      not browser-reachable, but preserves the prior fallback).
export function resolveBrowserApiUrl(
  env: Record<string, string | undefined> = process.env
): string {
  return env.PUBLIC_API_URL || env.NEXT_PUBLIC_API_BASE_URL || env.API_URL || ""
}
