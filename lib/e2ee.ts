const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

function b64FromBytes(bytes: Uint8Array): string {
  let s = ''
  bytes.forEach((b) => { s += String.fromCharCode(b) })
  return btoa(s)
}

function bytesFromB64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(u8.byteLength)
  copy.set(u8)
  return copy.buffer
}

// --- ECDH KEY EXCHANGE ---
export async function generateKeyPair() {
  return await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  )
}

export async function exportPublicKey(key: CryptoKey) {
  const exported = await crypto.subtle.exportKey('jwk', key)
  return JSON.stringify(exported)
}

export async function importPublicKey(jwkString: string) {
  const jwk = JSON.parse(jwkString)
  return await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, [])
}

export async function exportPrivateKey(key: CryptoKey) {
  return await crypto.subtle.exportKey('jwk', key)
}

export async function importPrivateKey(jwk: JsonWebKey) {
  return await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits'])
}

export async function deriveSharedKey(privateKey: CryptoKey, publicKey: CryptoKey) {
  return await crypto.subtle.deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false, // Non-extractable
    ['encrypt', 'decrypt']
  )
}

// --- FALLBACK PBKDF2 KEY (For older chats) ---
async function deriveKey(conversationId: string, context: 'text' | 'media'): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(`vanish-e2ee-v2:${context}:${conversationId}`),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: textEncoder.encode('go-vanish-salt-v2'), iterations: 100000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

// --- ENCRYPT / DECRYPT (Accepts ECDH key or falls back) ---
export async function encryptText(conversationId: string, plain: string, sharedKey?: CryptoKey): Promise<string> {
  const key = sharedKey || await deriveKey(conversationId, 'text')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, textEncoder.encode(plain))
  return `v1.${b64FromBytes(iv)}.${b64FromBytes(new Uint8Array(cipher))}`
}

export async function decryptText(conversationId: string, payload: string, sharedKey?: CryptoKey): Promise<string> {
  const parts = payload.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') throw new Error('Invalid ciphertext')
  const key = sharedKey || await deriveKey(conversationId, 'text')
  const iv = bytesFromB64(parts[1])
  const data = bytesFromB64(parts[2])
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(data))
  return textDecoder.decode(plain)
}

export function looksEncrypted(s: string): boolean {
  return typeof s === 'string' && s.startsWith('v1.') && s.split('.').length === 3
}

export async function encryptBytes(conversationId: string, data: ArrayBuffer, sharedKey?: CryptoKey): Promise<Uint8Array> {
  const key = sharedKey || await deriveKey(conversationId, 'media')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data))
  const out = new Uint8Array(12 + cipher.length)
  out.set(iv, 0)
  out.set(cipher, 12)
  return out
}

export async function decryptBytes(conversationId: string, encrypted: ArrayBuffer, sharedKey?: CryptoKey): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(encrypted)
  if (bytes.length < 13) throw new Error('Invalid encrypted media')
  const iv = bytes.slice(0, 12)
  const data = bytes.slice(12)
  const key = sharedKey || await deriveKey(conversationId, 'media')
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(data))
}

export async function generateSafetyCode(publicKeyA: string, publicKeyB: string): Promise<string> {
  // Create a stable, sorted string from both public keys
  const combo = [publicKeyA, publicKeyB].sort().join('|')
  const msgUint8 = textEncoder.encode(combo)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  const code = hashHex.substring(0, 6).toUpperCase()
  return `${code.substring(0, 3)}-${code.substring(3, 6)}`
}