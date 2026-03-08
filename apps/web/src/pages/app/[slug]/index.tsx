import type { GetServerSideProps } from "next"
import { auth } from "@/auth"
import { AppLayout } from "@/components/layout/app-layout"
import { Card, CardHeader, CardTitle } from "@/components/ui"

interface DashboardProps {
  slug: string
}

export default function DashboardPage({ slug }: DashboardProps) {
  return (
    <AppLayout slug={slug}>
      <div className="p-6">
        <h1 className="mb-6 text-xl font-semibold text-gray-900">Dashboard</h1>

        {/* 3-column grid on large screens, 1 column on mobile */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Recent Runs — placeholder, filled in Phase 3 */}
          <Card className="col-span-2 opacity-60">
            <CardHeader>
              <CardTitle>Recent Runs</CardTitle>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-400">Coming soon</span>
            </CardHeader>
            <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-gray-200">
              <p className="text-sm text-gray-400">Test runs will appear here once you start executing tests.</p>
            </div>
          </Card>

          {/* Coverage — placeholder */}
          <Card className="opacity-60">
            <CardHeader>
              <CardTitle>Coverage</CardTitle>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-400">Coming soon</span>
            </CardHeader>
            <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-gray-200">
              <p className="text-center text-sm text-gray-400">Coverage stats appear here.</p>
            </div>
          </Card>

          {/* Activity feed — placeholder */}
          <Card className="col-span-2 lg:col-span-3 opacity-60">
            <CardHeader>
              <CardTitle>Activity</CardTitle>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-400">Coming soon</span>
            </CardHeader>
            <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-gray-200">
              <p className="text-sm text-gray-400">Workspace activity will appear here.</p>
            </div>
          </Card>
        </div>

        {/* Projects */}
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Projects</h2>
          <Card>
            <p className="text-sm text-gray-500">
              Add your first test case to get started.{" "}
              <a href="#" className="text-cobalt hover:underline">Test Cases &rarr;</a>
            </p>
          </Card>
        </div>
      </div>
    </AppLayout>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await auth(context)
  if (!session) {
    return { redirect: { destination: "/login", permanent: false } }
  }

  const { slug } = context.params as { slug: string }

  return {
    props: { slug },
  }
}
