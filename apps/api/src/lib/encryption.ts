import crypto from "node:crypto"

// AES-256-GCM encryption for OAuth tokens.
// Key from ENCRYPTION_KEY env var (32-byte hex = 64 hex chars).
// Format: iv_hex:authTag_hex:ciphertext_hex

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 16 // 128-bit IV for GCM
const AUTH_TAG_LENGTH = 16 // 128-bit auth tag

function getKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY
  if (!keyHex) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is required for token encryption. " +
      "Set a 32-byte hex string (64 characters)."
    )
  }
  if (keyHex.length !== 64) {
    throw new Error(
      `ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). Got ${keyHex.length} characters.`
    )
  }
  return Buffer.from(keyHex, "hex")
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
