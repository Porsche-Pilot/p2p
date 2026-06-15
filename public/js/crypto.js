// ─── AES-GCM 256-bit Encryption Utilities ──────────────────

/**
 * Generate a new AES-GCM 256-bit key
 * @returns {Promise<CryptoKey>}
 */
export async function generateKey() {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // extractable — so we can embed it in URL
    ["encrypt", "decrypt"]
  );
}

/**
 * Export a CryptoKey to a Base64URL string (safe for URL hash)
 * @param {CryptoKey} key
 * @returns {Promise<string>}
 */
export async function exportKey(key) {
  const raw = await crypto.subtle.exportKey("raw", key);
  return bufferToBase64Url(raw);
}

/**
 * Import a CryptoKey from a Base64URL string
 * @param {string} base64url
 * @returns {Promise<CryptoKey>}
 */
export async function importKey(base64url) {
  const raw = base64UrlToBuffer(base64url);
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

/**
 * Encrypt an ArrayBuffer with AES-GCM
 * @param {CryptoKey} key
 * @param {ArrayBuffer} data
 * @returns {Promise<{iv: Uint8Array, ciphertext: ArrayBuffer}>}
 */
export async function encrypt(key, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );
  return { iv, ciphertext };
}

/**
 * Decrypt an ArrayBuffer with AES-GCM
 * @param {CryptoKey} key
 * @param {Uint8Array} iv
 * @param {ArrayBuffer} ciphertext
 * @returns {Promise<ArrayBuffer>}
 */
export async function decrypt(key, iv, ciphertext) {
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
}

/**
 * Compute SHA-256 hex digest of an ArrayBuffer
 * @param {ArrayBuffer} data
 * @returns {Promise<string>}
 */
export async function sha256(data) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Base64URL helpers ──────────────────────────────────────

function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBuffer(base64url) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
