import { describe, it, expect, afterAll } from "vitest"
import { emailQueue } from "../email.queue.js"
import { valkey } from "../../lib/valkey.js"

describe("emailQueue", () => {
  afterAll(async () => {
    await emailQueue.close()
    await valkey.quit()
  })

  it("can connect to Valkey", async () => {
    const pong = await valkey.ping()
    expect(pong).toBe("PONG")
  })

  it("can add a job to the email queue", async () => {
    const job = await emailQueue.add("test-otp", {
      to: "test@example.com",
      subject: "Your verification code",
      type: "otp",
      payload: { code: "123456" },
    })
    expect(job.id).toBeDefined()

    // Clean up
    await job.remove()
  })

  it("can get queue stats", async () => {
    const counts = await emailQueue.getJobCounts()
    expect(counts).toHaveProperty("waiting")
    expect(counts).toHaveProperty("active")
    expect(counts).toHaveProperty("completed")
    expect(counts).toHaveProperty("failed")
  })
})
