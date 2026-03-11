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

  let projectId = ""
  let runName = ""
  let items: RunItem[] = []

  if (!workspaceId) {
    return { props: { slug, projectKey, runId, runName, workspaceId, projectId, items } }
  }

  const apiUrl = process.env.API_URL ?? ""

  // Parallel: resolve project key + fetch run detail (independent)
  const [projectRes, runRes] = await Promise.all([
    fetch(`${apiUrl}/api/workspaces/${workspaceId}/projects/by-key/${projectKey}`, { headers }).catch(() => null),
    fetch(`${apiUrl}/api/workspaces/${workspaceId}/runs/${runId}`, { headers }).catch(() => null),
  ])

  if (projectRes?.ok) {
    const project = await projectRes.json() as { id: string }
    projectId = project.id
  }

  if (runRes?.ok) {
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

  return {
    props: JSON.parse(JSON.stringify({
      slug, projectKey, runId, runName, workspaceId, projectId, items,
      startIndex: context.query.item ? parseInt(context.query.item as string, 10) : null,
    })),
  }
}
