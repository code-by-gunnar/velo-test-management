// Server-side TTL cache for the projectKey → project lookup that every
// project-scoped page repeats in getServerSideProps. Project id and
// test_format are immutable, so a short TTL only delays name changes.
//
// The cache is shared across users of the same workspace: entries are only
// written from successful authorized responses, workspaceId always comes from
// the caller's own session JWT, and the payload is project metadata (id, name,
// format) — a member whose access was just revoked could at worst see that
// metadata for up to TTL_MS before API calls fail closed.
//
// Module-level state assumes a single web process (true for the compose
// stack); with multiple replicas each keeps its own cache, which is still
// correct, just less effective.

export interface ResolvedProject {
  id: string
  name: string
  test_format?: string
}

const cache = new Map<string, { value: ResolvedProject; expires: number }>()
const TTL_MS = 60_000

export async function resolveProject(
  workspaceId: string,
  projectKey: string,
  token: string | undefined
): Promise<ResolvedProject | null> {
  if (!workspaceId || !token) return null

  const key = `${workspaceId}:${projectKey}`
  const hit = cache.get(key)
  const now = Date.now()
  if (hit && hit.expires > now) return hit.value

  try {
    const res = await fetch(
      `${process.env.API_URL}/api/workspaces/${workspaceId}/projects/by-key/${projectKey}`,
      { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000) }
    )
    if (!res.ok) {
      cache.delete(key)
      return null
    }
    const project = (await res.json()) as ResolvedProject
    cache.set(key, { value: project, expires: now + TTL_MS })
    return project
  } catch {
    // API hiccup — serve a stale entry rather than breaking navigation
    return hit?.value ?? null
  }
}
