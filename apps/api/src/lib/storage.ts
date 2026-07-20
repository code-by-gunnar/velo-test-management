import {
  S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

// Read env lazily (ESM hoisting) — never capture at module top level.
function env(name: string): string | undefined {
  const v = process.env[name]
  return v && v.length > 0 ? v : undefined
}

export interface StorageConfig {
  endpoint?: string
  publicEndpoint?: string
  region: string
  accessKeyId?: string
  secretAccessKey?: string
  bucket?: string
}

// Canonical S3_* config with legacy R2_* fallback. R2 is just S3 with a
// derived endpoint + region "auto".
export function resolveStorageConfig(): StorageConfig {
  const acct = env("R2_ACCOUNT_ID")
  const endpoint =
    env("S3_ENDPOINT") ?? (acct ? `https://${acct}.r2.cloudflarestorage.com` : undefined)
  return {
    endpoint,
    publicEndpoint: env("S3_PUBLIC_ENDPOINT") ?? endpoint,
    region: env("S3_REGION") ?? "auto",
    accessKeyId: env("S3_ACCESS_KEY_ID") ?? env("R2_ACCESS_KEY_ID"),
    secretAccessKey: env("S3_SECRET_ACCESS_KEY") ?? env("R2_SECRET_ACCESS_KEY"),
    bucket: env("S3_BUCKET") ?? env("R2_BUCKET_NAME"),
  }
}

export function storageEnabled(): boolean {
  const c = resolveStorageConfig()
  return Boolean(c.endpoint && c.accessKeyId && c.secretAccessKey && c.bucket)
}

// Two clients: internal (S3_ENDPOINT) for I/O, public (S3_PUBLIC_ENDPOINT) for
// presigning. Presigned URLs are handed to the browser, which may not be able
// to reach an internal host like minio:9000 — sign against the public host.
let _io: S3Client | null = null
let _presign: S3Client | null = null

function buildClient(endpoint: string): S3Client {
  const c = resolveStorageConfig()
  if (!c.accessKeyId || !c.secretAccessKey) {
    throw new Error(
      "Storage is not configured. Set S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY."
    )
  }
  return new S3Client({
    region: c.region,
    endpoint,
    // MinIO and R2 require path-style; AWS S3 tolerates it.
    forcePathStyle: true,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
  })
}

function ioClient(): S3Client {
  if (_io) return _io
  const c = resolveStorageConfig()
  if (!c.endpoint) throw new Error("Storage is not configured. Set S3_ENDPOINT.")
  _io = buildClient(c.endpoint)
  return _io
}

function presignClient(): S3Client {
  if (_presign) return _presign
  const c = resolveStorageConfig()
  if (!c.publicEndpoint) throw new Error("Storage is not configured. Set S3_ENDPOINT.")
  _presign = c.publicEndpoint === c.endpoint ? ioClient() : buildClient(c.publicEndpoint)
  return _presign
}

function bucketOrThrow(): string {
  const b = resolveStorageConfig().bucket
  if (!b) throw new Error("S3_BUCKET is not set.")
  return b
}

export async function uploadObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await ioClient().send(
    new PutObjectCommand({ Bucket: bucketOrThrow(), Key: key, Body: body, ContentType: contentType })
  )
}

export async function downloadObject(key: string): Promise<Buffer> {
  const res = await ioClient().send(new GetObjectCommand({ Bucket: bucketOrThrow(), Key: key }))
  if (!res.Body) throw new Error(`Storage object not found: ${key}`)
  const chunks: Uint8Array[] = []
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) chunks.push(chunk)
  return Buffer.concat(chunks)
}

export async function getPresignedUrl(key: string): Promise<string> {
  return getSignedUrl(
    presignClient(),
    new GetObjectCommand({ Bucket: bucketOrThrow(), Key: key }),
    { expiresIn: 3600 }
  )
}

export function buildIngestionKey(
  workspaceId: string,
  format: "junit" | "allure",
  ingestionId: string
): string {
  const ext = format === "junit" ? "xml" : "json"
  return `ingestion/${workspaceId}/${format}/${ingestionId}/payload.${ext}`
}

export async function listObjects(prefix: string): Promise<string[]> {
  if (!storageEnabled()) return []
  const bucket = bucketOrThrow()
  const client = ioClient()
  const keys: string[] = []
  let token: string | undefined
  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token })
    )
    for (const obj of res.Contents ?? []) if (obj.Key) keys.push(obj.Key)
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return keys
}

export async function deleteObjects(keys: string[]): Promise<number> {
  if (keys.length === 0 || !storageEnabled()) return 0
  const bucket = bucketOrThrow()
  const client = ioClient()
  let deleted = 0
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000)
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
      })
    )
    deleted += chunk.length
  }
  return deleted
}

function isPrivateHost(endpoint: string): boolean {
  try {
    const h = new URL(endpoint).hostname
    if (h === "localhost" || !h.includes(".")) return true // bare docker service name, e.g. "minio"
    return /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h.endsWith(".local")
  } catch {
    return false
  }
}

// Boot-time guard against the #1 self-hoster footgun: an internal endpoint
// (minio:9000) with no public endpoint, so browsers get an unreachable
// presigned URL. Log a warning, don't throw.
export function warnIfMisconfigured(log: (msg: string) => void): void {
  if (!storageEnabled()) return
  const c = resolveStorageConfig()
  if (c.endpoint && isPrivateHost(c.endpoint) && !env("S3_PUBLIC_ENDPOINT")) {
    log(
      `[storage] S3_ENDPOINT (${c.endpoint}) looks private but S3_PUBLIC_ENDPOINT is unset — ` +
        `presigned download URLs will point at a host the browser can't reach. ` +
        `Set S3_PUBLIC_ENDPOINT to a host-reachable URL (e.g. http://localhost:9000).`
    )
  }
}
