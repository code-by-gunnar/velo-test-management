import { Worker } from "bullmq"
import { getBullMQWorkerConnectionOptions } from "../lib/valkey.js"
import { runLinearAiImport } from "../lib/ai-import.js"
import { setAiImportJobResult } from "./ai-import.queue.js"
import type { AiImportJobData } from "./ai-import.queue.js"

// Thin worker: the extraction logic lives in lib/ai-import.ts (unit-testable
// without a running Worker). runLinearAiImport never throws — it always resolves
// to a result we persist for the poll endpoint (VEL-61).
export const aiImportWorker = new Worker<AiImportJobData>(
  "ai-import",
  async (job) => {
    const { jobId, workspaceId, projectId, issueId, userId } = job.data
    const result = await runLinearAiImport(
      { workspaceId, projectId, issueId, userId },
      {
        warn: (obj, msg) => console.warn("[ai-import-worker]", msg ?? "", obj),
        error: (obj, msg) => console.error("[ai-import-worker]", msg ?? "", obj),
      }
    )
    await setAiImportJobResult(jobId, workspaceId, result)
  },
  {
    connection: getBullMQWorkerConnectionOptions(),
    concurrency: 3,
  }
)

aiImportWorker.on("completed", (job) => {
  console.log(`[ai-import-worker] Job ${job.id} completed`)
})

aiImportWorker.on("failed", async (job, err) => {
  console.error(`[ai-import-worker] Job ${job?.id} failed:`, err.message)
  // Defensive: runLinearAiImport shouldn't throw, but if the processor fails for
  // any other reason, persist an error result so the poller doesn't hang on
  // "processing" forever.
  if (job) {
    try {
      await setAiImportJobResult(job.data.jobId, job.data.workspaceId, {
        status: "error",
        code: "ai_failed",
        error: "AI service temporarily unavailable. Please try again.",
      })
    } catch {
      /* best-effort */
    }
  }
})
