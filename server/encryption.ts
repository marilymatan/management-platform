/**
 * Field-Level Encryption Module
 * 
 * Provides AES-256-GCM encryption for sensitive database fields.
 * Uses a dedicated encryption key separate from JWT_SECRET.
 * 
 * Encrypted format: iv:authTag:ciphertext (all hex-encoded)
 */

import crypto from "crypto";

// ─── Key Derivation ─────────────────────────────────────────────────────────
// Use a dedicated ENCRYPTION_KEY env var (64-char hex = 32 bytes).
// Falls back to HKDF derivation from JWT_SECRET for backward compatibility
// with data encrypted before the dedicated key was set.
const ALGORITHM = "aes-256-gcm";

function deriveKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey && envKey.length >= 32) {
    if (/^[0-9a-f]{64}$/i.test(envKey)) {
      return Buffer.from(envKey, "hex");
    }
    return crypto.createHash("sha256").update(envKey).digest();
  }
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error(
      "[Security] ENCRYPTION_KEY or JWT_SECRET must be set. Refusing to start with fallback keys."
    );
  }
  const SALT = "insurance-analyzer-field-encryption-v1";
  return Buffer.from(
    crypto.hkdfSync("sha256", jwtSecret, SALT, "field-encryption", 32)
  );
}

const FIELD_ENCRYPTION_KEY = deriveKey();

// ─── Encrypt / Decrypt ──────────────────────────────────────────────────────

/**
 * Encrypt a string value using AES-256-GCM.
 * Returns format: iv:authTag:ciphertext (hex-encoded)
 */
export function encryptField(plaintext: string): string {
  if (!plaintext) return plaintext;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(FIELD_ENCRYPTION_KEY),
    iv
  );
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("hex"),
    tag.toString("hex"),
    encrypted.toString("hex"),
  ].join(":");
}

/**
 * Decrypt an AES-256-GCM encrypted string.
 * Expects format: iv:authTag:ciphertext (hex-encoded)
 */
export function decryptField(encryptedText: string): string {
  if (!encryptedText) return encryptedText;
  // If it doesn't look encrypted (no colons), return as-is (legacy data)
  if (!encryptedText.includes(":") || encryptedText.split(":").length !== 3) {
    return encryptedText;
  }
  try {
    const [ivHex, tagHex, dataHex] = encryptedText.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const data = Buffer.from(dataHex, "hex");
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      Buffer.from(FIELD_ENCRYPTION_KEY),
      iv
    );
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      "utf8"
    );
  } catch {
    // If decryption fails, return as-is (legacy unencrypted data)
    return encryptedText;
  }
}

/**
 * Encrypt a JSON-serializable object.
 * Serializes to JSON string, then encrypts.
 */
export function encryptJson(obj: unknown): string {
  if (obj === null || obj === undefined) return "";
  return encryptField(JSON.stringify(obj));
}

/**
 * Decrypt and parse a JSON object.
 * Decrypts the string, then parses as JSON.
 */
export function decryptJson<T = unknown>(encryptedText: string): T | null {
  if (!encryptedText) return null;
  try {
    const decrypted = decryptField(encryptedText);
    return JSON.parse(decrypted) as T;
  } catch {
    // If it's already a JSON string (legacy unencrypted data), try parsing directly
    try {
      return JSON.parse(encryptedText) as T;
    } catch {
      return null;
    }
  }
}

/**
 * Check if a string appears to be encrypted (has the iv:tag:data format)
 */
export function isEncrypted(text: string): boolean {
  if (!text) return false;
  const parts = text.split(":");
  return parts.length === 3 && parts.every((p) => /^[0-9a-f]+$/i.test(p));
}
