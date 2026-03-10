import type { GetServerSideProps } from "next"
import { auth } from "@/auth"
import { ExecutionScreen } from "@/components/runs/ExecutionScreen"
import type { RunItem } from "@/components/runs/ExecutionScreen"

interface ExecutePageProps {
  slug: string
  projectKey: string
  runId: string
  runName: string
  workspaceId: string
  projectId: string
  items: RunItem[]
  startIndex: number | null
}

export default function ExecutePage({
  slug,
  projectKey,
  runId,
  runName,
  workspaceId,
  projectId,
  items,
  startIndex,
}: ExecutePageProps) {
  return (
    <ExecutionScreen
      runId={runId}
      runName={runName}
      workspaceId={workspaceId}
      projectId={projectId}
      items={items}
      slug={slug}
      projectKey={projectKey}
      startIndex={startIndex}
    />
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await auth(context)
  if (!session) return { redirect: { destination: "/login", permanent: false } }

  const { slug, projectKey, runId } = context.params as {
    slug: string
    projectKey: string
    runId: string
  }

  const workspaceId = session.user.workspace_id ?? ""
  const token =
    context.req.cookies["__Secure-authjs.session-token"] ??
    context.req.cookies["authjs.session-token"]

  const headers = token ? { authorization: `Bearer ${token}` } : {}

  // Resolve projectId from projectKey
  let projectId = ""
  let runName = ""
  let items: RunItem[] = []

  if (!workspaceId) {
    return { props: { slug, projectKey, runId, runName, workspaceId, projectId, items } }
  }

  try {
    // Look up project ID by key
    const projectsRes = await fetch(
      `${process.env.API_URL}/api/workspaces/${workspaceId}/projects`,
      { headers }
    )
    if (projectsRes.ok) {
      const projects = await projectsRes.json() as Array<{ id: string; project_key: string }>
      const project = projects.find((p) => p.project_key === projectKey)
      projectId = project?.id ?? ""
    }
  } catch {
    // projectId stays empty
  }

  if (!projectId) {
    return { props: { slug, projectKey, runId, runName, workspaceId, projectId, items } }
  }

  try {
    // Fetch run detail to get items
    const runRes = await fetch(
      `${process.env.API_URL}/api/workspaces/${workspaceId}/runs/${runId}`,
      { headers }
    )
    if (runRes.ok) {
      const run = await runRes.json() as {
        id: string
        name: string
        status: string
        items: RunItem[]
      }
      runName = run.name ?? ""
      items = (run.items ?? []).map((item) => ({
        ...item,
        case_title: item.case_title ?? "",
      }))
    }
  } catch {
    // items stays empty
  }

  return {
    props: JSON.parse(JSON.stringify({
      slug, projectKey, runId, runName, workspaceId, projectId, items,
      startIndex: context.query.item ? parseInt(context.query.item as string, 10) : null,
    })),
  }
}
