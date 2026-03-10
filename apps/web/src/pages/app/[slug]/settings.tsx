import type { GetServerSideProps } from "next"
import { auth } from "@/auth"
import { AppLayout } from "@/components/layout/app-layout"
import { ApiKeysPanel } from "@/components/settings/ApiKeysPanel"

interface SettingsProps {
  slug: string
  workspaceId: string
}

export default function SettingsPage({ slug, workspaceId }: SettingsProps) {
  return (
    <AppLayout slug={slug}>
      <div className="p-6 max-w-3xl">
        <h1 className="mb-6 text-xl font-semibold">Settings</h1>
        <ApiKeysPanel workspaceId={workspaceId} />
      </div>
    </AppLayout>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await auth(context)
  if (!session) return { redirect: { destination: "/login", permanent: false } }
  return {
    props: {
      slug: context.params?.slug as string,
      workspaceId: session.user.workspace_id ?? "",
    },
  }
}
