import crypto from "node:crypto"

// AES-256-GCM encryption for OAuth tokens.
// Key from ENCRYPTION_KEY env var (32-byte hex = 64 hex chars).
// Format: iv_hex:authTag_hex:ciphertext_hex

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 16 // 128-bit IV for GCM
const AUTH_TAG_LENGTH = 16 // 128-bit auth tag

/**
 * Why the configured ENCRYPTION_KEY is unusable, or null if it is fine.
 *
 * Single source of truth for key validity: getKey() throws this message, and
 * isEncryptionConfigured() reports the same verdict to routes that want to fail
 * fast with an actionable 503 instead of an opaque 500. Never let the two drift.
 *
 * Reads are lazy (the caller passes process.env.ENCRYPTION_KEY in) — a
 * module-top-level capture would freeze the value before test setup runs.
 *
 * Strict about hex on purpose: Buffer.from(str, "hex") does NOT throw on invalid
 * input — it decodes until the first bad pair and returns a SHORT buffer, so a
 * 64-char base64 secret would sail past a length-only check and blow up later in
 * createCipheriv with an unhelpful "Invalid key length". Operators reusing the
 * `openssl rand -base64 32` recipe from the deploy docs land exactly there.
 */
function encryptionKeyError(keyHex: string | undefined): string | null {
  if (!keyHex) {
    return (
      "ENCRYPTION_KEY environment variable is required for token encryption. " +
      "Set a 32-byte hex string (64 characters)."
    )
  }
  if (keyHex.length !== 64) {
    return `ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). Got ${keyHex.length} characters.`
  }
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    return "ENCRYPTION_KEY must be hex characters only (0-9, a-f). Generate one with: openssl rand -hex 32"
  }
  return null
}

function getKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY
  const problem = encryptionKeyError(keyHex)
  if (problem) throw new Error(problem)
  return Buffer.from(keyHex!, "hex")
}

/**
 * True when credentials can actually be encrypted at rest. Routes that store a
 * secret (AI provider keys, Linear API key) check this BEFORE doing any provider
 * round-trip, so a misconfigured deployment gets a named error rather than a 500.
 */
export function isEncryptionConfigured(): boolean {
  return encryptionKeyError(process.env.ENCRYPTION_KEY) === null
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns: iv_hex:authTag_hex:ciphertext_hex
 */
export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })

  let encrypted = cipher.update(plaintext, "utf8", "hex")
  encrypted += cipher.final("hex")

  const authTag = cipher.getAuthTag()

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`
}

/**
 * Decrypt a string encrypted by encrypt().
 * Input format: iv_hex:authTag_hex:ciphertext_hex
 */
export function decrypt(encrypted: string): string {
  const key = getKey()
  const parts = encrypted.split(":")
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted format — expected iv:authTag:ciphertext")
  }

  const ivHex = parts[0]!
  const authTagHex = parts[1]!
  const ciphertext = parts[2]!

  const iv = Buffer.from(ivHex, "hex")
  const authTag = Buffer.from(authTagHex, "hex")

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)

  let decrypted: string = decipher.update(ciphertext, "hex", "utf8")
  decrypted += decipher.final("utf8")

  return decrypted
}
