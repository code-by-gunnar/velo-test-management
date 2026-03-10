import type { ServerResponse } from "node:http"

export function writeSSEEvent(res: ServerResponse, data: unknown, event?: string): void {
  if (event) res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

export function startHeartbeat(res: ServerResponse, intervalMs = 20_000): NodeJS.Timeout {
  return setInterval(() => {
    res.write(": heartbeat\n\n")
  }, intervalMs)
}
