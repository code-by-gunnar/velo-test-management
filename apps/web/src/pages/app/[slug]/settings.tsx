import type { GetServerSideProps } from "next"
import { auth } from "@/auth"
import { AppLayout } from "@/components/layout/app-layout"
import { Card } from "@/components/ui"

interface SettingsProps { slug: string }

export default function SettingsPage({ slug }: SettingsProps) {
  return (
    <AppLayout slug={slug}>
      <div className="p-6">
        <h1 className="mb-6 text-xl font-semibold">Settings</h1>
        <Card>
          <p className="text-sm text-gray-500">Workspace settings will be added in a future update.</p>
        </Card>
      </div>
    </AppLayout>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await auth(context)
  if (!session) return { redirect: { destination: "/login", permanent: false } }
  return { props: { slug: context.params?.slug as string } }
}
