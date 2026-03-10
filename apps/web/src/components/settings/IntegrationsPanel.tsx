import { Card, CardHeader, CardTitle } from "@/components/ui"
import { LinearConnect } from "./LinearConnect"

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

        <LinearConnect workspaceId={workspaceId} />

        <p className="mt-4 text-xs text-gray-400">
          More integrations coming soon
        </p>
      </Card>
    </div>
  )
}
