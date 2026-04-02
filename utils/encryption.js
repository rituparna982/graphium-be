const crypto = require('crypto');

// ─── AES-256-GCM Encryption ───────────────────────────────────────────────────
// Industry-standard authenticated encryption. Each encryption produces a unique
// random IV, making identical plaintexts produce different ciphertexts.
// Format: iv:ciphertext:authTag (all hex-encoded)

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;       // 96-bit IV (NIST recommended for GCM)
const AUTH_TAG_LENGTH = 16;  // 128-bit authentication tag

function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (256-bit key)');
  }
  return Buffer.from(key, 'hex');
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * @param {string} plaintext - The text to encrypt
 * @returns {string} Format: iv:ciphertext:authTag (hex-encoded)
 */
function encrypt(plaintext) {
  if (!plaintext) return plaintext;
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${encrypted}:${authTag}`;
}

/**
 * Decrypts AES-256-GCM ciphertext.
 * @param {string} ciphertext - Format: iv:ciphertext:authTag (hex-encoded)
 * @returns {string} Decrypted plaintext
 */
function decrypt(ciphertext) {
  if (!ciphertext || !ciphertext.includes(':')) return ciphertext;
  const key = getEncryptionKey();
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('Invalid ciphertext format');

  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const authTag = Buffer.from(parts[2], 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Creates a deterministic HMAC-SHA256 hash for indexed lookups.
 * Used for email lookup without exposing plaintext in the database.
 * @param {string} value - The value to hash
 * @returns {string} Hex-encoded HMAC hash
 */
function hmacHash(value) {
  if (!value) return value;
  const key = getEncryptionKey();
  return crypto.createHmac('sha256', key).update(value.toLowerCase().trim()).digest('hex');
}

/**
 * Generates a cryptographically secure random key (for .env setup).
 * @returns {string} 64-character hex string (256 bits)
 */
function generateKey() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = { encrypt, decrypt, hmacHash, generateKey };
