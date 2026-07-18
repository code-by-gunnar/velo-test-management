import { describe, it, expect, vi } from "vitest"
import type { Redis } from "iovalkey"
import type { FastifyReply, FastifyRequest } from "fastify"
import { createRateLimiter } from "../rate-limiter.js"

function fakeReply() {
  const state: { statusCode?: number; body?: unknown; headers: Record<string, string> } = { headers: {} }
  const reply = {
    header: (k: string, v: string) => {
      state.headers[k] = v
      return reply
    },
    status: (c: number) => {
      state.statusCode = c
      return reply
    },
    send: (b: unknown) => {
      state.body = b
      return reply
    },
  }
  return { reply: reply as unknown as FastifyReply, state }
}

function fakeReq(apiKeyId: string | undefined) {
  return {
    apiKeyId,
    log: { warn: vi.fn(), error: vi.fn() },
  } as unknown as FastifyRequest
}

describe("createRateLimiter fail-closed (VEL-54)", () => {
  it("returns 503 (not fail-open) when Valkey errors, so limits can't be bypassed by killing Valkey", async () => {
    const valkey = {
      incr: vi.fn().mockRejectedValue(new Error("valkey down")),
      expire: vi.fn(),
    } as unknown as Redis
    const limiter = createRateLimiter(valkey)
    const { reply, state } = fakeReply()

    await limiter(fakeReq("key-1"), reply)

    expect(state.statusCode).toBe(503)
    expect(state.headers["Retry-After"]).toBeDefined()
  })

  it("still skips rate limiting for non-API-key (session) requests", async () => {
    const valkey = { incr: vi.fn(), expire: vi.fn() } as unknown as Redis
    const limiter = createRateLimiter(valkey)
    const { reply, state } = fakeReply()

    await limiter(fakeReq(undefined), reply)

    expect((valkey.incr as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
    expect(state.statusCode).toBeUndefined()
  })

  it("allows requests under the limit through", async () => {
    const valkey = {
      incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
    } as unknown as Redis
    const limiter = createRateLimiter(valkey, { max: 5 })
    const { reply, state } = fakeReply()

    await limiter(fakeReq("key-1"), reply)

    expect(state.statusCode).toBeUndefined()
    expect(state.headers["X-RateLimit-Remaining"]).toBe("4")
  })
})
