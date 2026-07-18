import { Card, CardHeader, CardTitle } from "@/components/ui"
import { LinearConnect } from "./LinearConnect"
import { AiProviderConnect } from "./AiProviderConnect"

interface IntegrationsPanelProps {
  workspaceId: string
}

export function IntegrationsPanel({ workspaceId }: IntegrationsPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
        </CardHeader>

        <div className="flex flex-col gap-4">
          <LinearConnect workspaceId={workspaceId} />
          <AiProviderConnect workspaceId={workspaceId} />
        </div>

        <p className="mt-4 text-xs text-gray-400">
          Error tracking (Sentry) and product analytics (PostHog) are optional and
          off by default. Enable them for this instance via environment variables —
          see <code className="font-mono text-[11px]">.env.example</code>.
        </p>
      </Card>
    </div>
  )
}
