import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

// R2 configuration is loaded from environment variables.
// All 4 vars must be set for R2 to be enabled.
const R2_ACCOUNT_ID = process.env["R2_ACCOUNT_ID"]
const R2_ACCESS_KEY_ID = process.env["R2_ACCESS_KEY_ID"]
const R2_SECRET_ACCESS_KEY = process.env["R2_SECRET_ACCESS_KEY"]
const R2_BUCKET_NAME = process.env["R2_BUCKET_NAME"]

/**
 * Returns true if all required R2 environment variables are set.
 * Use this guard before calling upload/presign functions in environments
 * where R2 is optional (local dev, tests).
 */
export function r2Enabled(): boolean {
  return Boolean(
    R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME
  )
}

// Lazy singleton — created on first call to getR2Client().
// This avoids crashing at module load time when R2 env vars are not configured
// (local dev, CI test runs).
let _r2Client: S3Client | null = null

/**
 * Returns the shared R2 S3Client instance, creating it on first call.
 * Throws if any required environment variable is missing.
 */
export function getR2Client(): S3Client {
  if (_r2Client) return _r2Client

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error(
      "R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME."
    )
  }

  _r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  })

  return _r2Client
}

/**
 * Upload a Buffer to R2 at the given key.
 *
 * @param key         - Object key within the bucket (e.g. from buildR2Key)
 * @param body        - File content as a Buffer
 * @param contentType - MIME type (e.g. "application/xml", "application/json")
 */
export async function uploadToR2(key: string, body: Buffer, contentType: string): Promise<void> {
  if (!R2_BUCKET_NAME) {
    throw new Error("R2_BUCKET_NAME is not set.")
  }

  const client = getR2Client()
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  })

  await client.send(command)
}

/**
 * Generate a presigned download URL for an R2 object.
 * URL expires in 1 hour (3600 seconds).
 *
 * @param key - Object key within the bucket
 * @returns   - Presigned HTTPS URL
 */
export async function getR2PresignedUrl(key: string): Promise<string> {
  if (!R2_BUCKET_NAME) {
    throw new Error("R2_BUCKET_NAME is not set.")
  }

  const client = getR2Client()
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  })

  return getSignedUrl(client, command, { expiresIn: 3600 })
}

/**
 * Build a canonical R2 object key for a CI ingestion payload.
 *
 * Format: ingestion/{workspaceId}/{format}/{ingestionId}/payload.{ext}
 *   - format "junit"  -> ext "xml"
 *   - format "allure" -> ext "json"
 *
 * @param workspaceId - Workspace UUID
 * @param format      - "junit" or "allure"
 * @param ingestionId - CI ingestion run UUID
 */
export function buildR2Key(
  workspaceId: string,
  format: "junit" | "allure",
  ingestionId: string
): string {
  const ext = format === "junit" ? "xml" : "json"
  return `ingestion/${workspaceId}/${format}/${ingestionId}/payload.${ext}`
}

/**
 * List all object keys under a given prefix (paginated).
 * Returns an empty array if R2 is not configured.
 */
export async function listR2Objects(prefix: string): Promise<string[]> {
  if (!R2_BUCKET_NAME || !r2Enabled()) return []

  const client = getR2Client()
  const keys: string[] = []
  let continuationToken: string | undefined

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    )

    if (response.Contents) {
      for (const obj of response.Contents) {
        if (obj.Key) keys.push(obj.Key)
      }
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
  } while (continuationToken)

  return keys
}

/**
 * Batch-delete objects from R2 by key. Deletes in chunks of 1000
 * (S3 API limit). Returns the count of keys submitted for deletion.
 * Returns 0 if keys array is empty or R2 is not configured.
 */
export async function deleteR2Objects(keys: string[]): Promise<number> {
  if (keys.length === 0 || !R2_BUCKET_NAME || !r2Enabled()) return 0

  const client = getR2Client()
  let deleted = 0

  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000)
    await client.send(
      new DeleteObjectsCommand({
        Bucket: R2_BUCKET_NAME,
        Delete: {
          Objects: chunk.map((key) => ({ Key: key })),
          Quiet: true,
        },
      })
    )
    deleted += chunk.length
  }

  return deleted
}

// Named export for backward compatibility (alias for getR2Client)
export const r2Client = { get: getR2Client }
