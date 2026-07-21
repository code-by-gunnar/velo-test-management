import { describe, it, expect } from "vitest"
import { Readable } from "node:stream"
import { readBodyWithLimit, BODY_TOO_LARGE } from "@/lib/read-body-limit"

// VEL-64: the /api/backend gateway must not buffer an unbounded request body
// into memory (a pre-auth memory-DoS). readBodyWithLimit rejects once a strict
// byte threshold is crossed instead of accumulating without bound.

function streamOf(...chunks: Buffer[]): Readable {
  return Readable.from(chunks)
}

describe("readBodyWithLimit (VEL-64)", () => {
  it("resolves with the full body when under the limit", async () => {
    const body = Buffer.from("hello world")
    const buf = await readBodyWithLimit(streamOf(body), 1024)
    expect(buf.equals(body)).toBe(true)
  })

  it("resolves when the body is exactly at the limit", async () => {
    const body = Buffer.alloc(100, 0x61)
    const buf = await readBodyWithLimit(streamOf(body), 100)
    expect(buf.length).toBe(100)
  })

  it("rejects with BODY_TOO_LARGE once the limit is exceeded", async () => {
    const body = Buffer.alloc(101, 0x61)
    await expect(readBodyWithLimit(streamOf(body), 100)).rejects.toMatchObject({
      code: BODY_TOO_LARGE,
    })
  })

  it("rejects when the total across multiple chunks exceeds the limit", async () => {
    const chunks = [Buffer.alloc(60, 1), Buffer.alloc(60, 2)] // 120 > 100
    await expect(readBodyWithLimit(streamOf(...chunks), 100)).rejects.toMatchObject({
      code: BODY_TOO_LARGE,
    })
  })

  it("returns an empty buffer for an empty stream", async () => {
    const buf = await readBodyWithLimit(streamOf(), 1024)
    expect(buf.length).toBe(0)
  })
})
