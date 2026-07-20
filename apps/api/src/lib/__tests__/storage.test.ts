import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  storageEnabled,
  resolveStorageConfig,
  buildIngestionKey,
  warnIfMisconfigured,
} from "../storage.js"

const KEYS = [
  "S3_ENDPOINT", "S3_PUBLIC_ENDPOINT", "S3_REGION",
  "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_BUCKET",
  "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME",
]

describe("storage config resolution", () => {
  let saved: Record<string, string | undefined>
  beforeEach(() => {
    saved = {}
    for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k] }
  })
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it("is disabled when nothing is set", () => {
    expect(storageEnabled()).toBe(false)
  })

  it("resolves S3_* vars", () => {
    process.env.S3_ENDPOINT = "https://s3.example.com"
    process.env.S3_REGION = "us-east-1"
    process.env.S3_ACCESS_KEY_ID = "ak"
    process.env.S3_SECRET_ACCESS_KEY = "sk"
    process.env.S3_BUCKET = "velo"
    const c = resolveStorageConfig()
    expect(c.endpoint).toBe("https://s3.example.com")
    expect(c.region).toBe("us-east-1")
    expect(c.bucket).toBe("velo")
    expect(storageEnabled()).toBe(true)
  })

  it("falls back to legacy R2_* vars and derives the R2 endpoint", () => {
    process.env.R2_ACCOUNT_ID = "acct123"
    process.env.R2_ACCESS_KEY_ID = "ak"
    process.env.R2_SECRET_ACCESS_KEY = "sk"
    process.env.R2_BUCKET_NAME = "evidence"
    const c = resolveStorageConfig()
    expect(c.endpoint).toBe("https://acct123.r2.cloudflarestorage.com")
    expect(c.region).toBe("auto")
    expect(c.bucket).toBe("evidence")
    expect(storageEnabled()).toBe(true)
  })

  it("S3_* wins over R2_* when both are present", () => {
    process.env.R2_ACCOUNT_ID = "acct123"
    process.env.S3_ENDPOINT = "http://minio:9000"
    expect(resolveStorageConfig().endpoint).toBe("http://minio:9000")
  })

  it("publicEndpoint defaults to endpoint, else the explicit value", () => {
    process.env.S3_ENDPOINT = "http://minio:9000"
    expect(resolveStorageConfig().publicEndpoint).toBe("http://minio:9000")
    process.env.S3_PUBLIC_ENDPOINT = "http://localhost:9000"
    expect(resolveStorageConfig().publicEndpoint).toBe("http://localhost:9000")
  })

  it("buildIngestionKey encodes format extension", () => {
    expect(buildIngestionKey("ws", "junit", "id")).toBe("ingestion/ws/junit/id/payload.xml")
    expect(buildIngestionKey("ws", "allure", "id")).toBe("ingestion/ws/allure/id/payload.json")
  })

  it("warns when endpoint is private but no public endpoint is set", () => {
    process.env.S3_ENDPOINT = "http://minio:9000"
    process.env.S3_ACCESS_KEY_ID = "ak"
    process.env.S3_SECRET_ACCESS_KEY = "sk"
    process.env.S3_BUCKET = "velo"
    const msgs: string[] = []
    warnIfMisconfigured((m) => msgs.push(m))
    expect(msgs.some((m) => m.includes("S3_PUBLIC_ENDPOINT"))).toBe(true)
  })

  it("does not warn when a public endpoint is set", () => {
    process.env.S3_ENDPOINT = "http://minio:9000"
    process.env.S3_PUBLIC_ENDPOINT = "http://localhost:9000"
    process.env.S3_ACCESS_KEY_ID = "ak"
    process.env.S3_SECRET_ACCESS_KEY = "sk"
    process.env.S3_BUCKET = "velo"
    const msgs: string[] = []
    warnIfMisconfigured((m) => msgs.push(m))
    expect(msgs).toHaveLength(0)
  })
})
