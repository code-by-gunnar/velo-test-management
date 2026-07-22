import { Queue } from "bullmq"
import { getBullMQConnectionOptions, valkey } from "../lib/valkey.js"
import type { AiImportResult } from "../lib/ai-import.js"

export interface AiImportJobData {
  jobId: string
  workspaceId: string
  projectId: string
  issueId: string
  userId: string
}

/**
 * AI spec-to-test import queue (VEL-61). Moves the slow Linear-fetch + AI call off
 * the request thread so a slow local model can't hit a proxy/gateway idle timeout.
 * Processed by aiImportWorker in ai-import.worker.ts.
 *
 * attempts: 1 — each run calls a (potentially paid) AI API and captures an analytics
 * event; the extraction retries a garbled parse internally, and the user can
 * re-trigger. Auto-retrying the whole job would double-charge + double-count.
 */
export const aiImportQueue = new Queue<AiImportJobData>("ai-import", {
  connection: getBullMQConnectionOptions(),
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 200 },
  },
})

// Job status lives in Valkey (not on the BullMQ job) so the poll endpoint reads a
// stable, workspace-scoped record independent of BullMQ retention. Keyed by a
// caller-generated jobId so the POST controls the id it hands back.
const JOB_TTL_SECONDS = 3600
const jobKey = (jobId: string) => `ai-import:job:${jobId}`

export interface StoredAiImportJob {
  workspaceId: string
  status: "processing" | "done" | "error"
  issue?: unknown
  suggested_cases?: unknown
  parse_failed?: boolean
  code?: string
  error?: string
}

// Write the initial "processing" record so the poller always finds the job
// (until TTL) and can tell "processing" apart from "unknown/expired".
export async function initAiImportJob(jobId: string, workspaceId: string): Promise<void> {
  await valkey.set(jobKey(jobId), JSON.stringify({ workspaceId, status: "processing" }), "EX", JOB_TTL_SECONDS)
}

export async function setAiImportJobResult(jobId: string, workspaceId: string, result: AiImportResult): Promise<void> {
  await valkey.set(jobKey(jobId), JSON.stringify({ workspaceId, ...result }), "EX", JOB_TTL_SECONDS)
}

export async function getAiImportJob(jobId: string): Promise<StoredAiImportJob | null> {
  const raw = await valkey.get(jobKey(jobId))
  return raw ? (JSON.parse(raw) as StoredAiImportJob) : null
}
