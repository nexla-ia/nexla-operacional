// Criptografia E2E para o cofre de Acessos.
// Master password → PBKDF2-SHA256 (250k iter) → AES-GCM 256.
// A chave nunca sai da memória do browser, jamais é serializada,
// e some quando o componente desmonta ou o usuário tranca o cofre.

const PBKDF2_ITERATIONS = 250_000
const VERIFIER_PLAINTEXT = 'NEXLA_VAULT_OK_v1'

const enc = new TextEncoder()
const dec = new TextDecoder()

// ── codificação ──────────────────────────────────────────────────────────────

function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

function b64ToBuf(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

// ── derivação ────────────────────────────────────────────────────────────────

export async function deriveKey(password: string, saltB64: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw', enc.encode(password),
    'PBKDF2', false, ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: b64ToBuf(saltB64),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,                       // extractable: false → impossível serializar
    ['encrypt', 'decrypt'],
  )
}

// ── primitivos ───────────────────────────────────────────────────────────────

export async function encryptString(
  key: CryptoKey,
  plaintext: string,
): Promise<{ iv: string; ciphertext: string }> {
  const ivBytes = crypto.getRandomValues(new Uint8Array(12))
  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBytes },
    key,
    enc.encode(plaintext),
  )
  return { iv: bufToB64(ivBytes), ciphertext: bufToB64(ctBuf) }
}

export async function decryptString(
  key: CryptoKey,
  ivB64: string,
  ciphertextB64: string,
): Promise<string> {
  const ptBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBuf(ivB64) },
    key,
    b64ToBuf(ciphertextB64),
  )
  return dec.decode(ptBuf)
}

// ── operações de alto nível ──────────────────────────────────────────────────

export async function newSalt(): Promise<string> {
  return bufToB64(crypto.getRandomValues(new Uint8Array(16)))
}

export async function buildVaultConfig(password: string): Promise<{
  salt: string; verifier_iv: string; verifier: string
}> {
  const salt = await newSalt()
  const key  = await deriveKey(password, salt)
  const { iv, ciphertext } = await encryptString(key, VERIFIER_PLAINTEXT)
  return { salt, verifier_iv: iv, verifier: ciphertext }
}

export async function verifyAndUnlock(
  password: string,
  salt: string,
  verifier_iv: string,
  verifier: string,
): Promise<CryptoKey | null> {
  try {
    const key = await deriveKey(password, salt)
    const decrypted = await decryptString(key, verifier_iv, verifier)
    if (decrypted === VERIFIER_PLAINTEXT) return key
    return null
  } catch {
    return null
  }
}
