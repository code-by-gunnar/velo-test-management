import type { GetServerSideProps } from "next"
import { auth } from "@/auth"
import { AppLayout } from "@/components/layout/app-layout"
import { Card } from "@/components/ui"

interface ProjectHomeProps { slug: string; projectKey: string }

export default function ProjectHomePage({ slug, projectKey }: ProjectHomeProps) {
  return (
    <AppLayout slug={slug} projectKey={projectKey}>
      <div className="p-6">
        <h1 className="mb-2 text-xl font-semibold">{projectKey.toUpperCase()}</h1>
        <p className="mb-6 text-sm text-gray-500">Test cases and runs are coming in Phase 2.</p>
        <Card>
          <p className="text-sm text-gray-400">This project is ready. Add test cases to get started.</p>
        </Card>
      </div>
    </AppLayout>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await auth(context)
  if (!session) return { redirect: { destination: "/login", permanent: false } }
  const { slug, projectKey } = context.params as { slug: string; projectKey: string }
  return { props: { slug, projectKey } }
}
