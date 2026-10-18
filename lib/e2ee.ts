const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

function b64FromBytes(bytes: Uint8Array): string {
  let s = ''
  bytes.forEach((b) => {
    s += String.fromCharCode(b)
  })
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

async function deriveKey(conversationId: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(`vanish-e2ee-v1:${conversationId}`),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: textEncoder.encode('go-vanish-salt-v1'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encryptText(
  conversationId: string,
  plain: string
): Promise<string> {
  const key = await deriveKey(conversationId)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    textEncoder.encode(plain)
  )
  return `v1.${b64FromBytes(iv)}.${b64FromBytes(new Uint8Array(cipher))}`
}

export async function decryptText(
  conversationId: string,
  payload: string
): Promise<string> {
  const parts = payload.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') {
    throw new Error('Invalid ciphertext')
  }
  const key = await deriveKey(conversationId)
  const iv = bytesFromB64(parts[1])
  const data = bytesFromB64(parts[2])
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(data)
  )
  return textDecoder.decode(plain)
}

export function looksEncrypted(s: string): boolean {
  return typeof s === 'string' && s.startsWith('v1.') && s.split('.').length === 3
}

export async function encryptBytes(
  conversationId: string,
  data: ArrayBuffer
): Promise<Uint8Array> {
  const key = await deriveKey(conversationId)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)
  )
  const out = new Uint8Array(12 + cipher.length)
  out.set(iv, 0)
  out.set(cipher, 12)
  return out
}

export async function decryptBytes(
  conversationId: string,
  encrypted: ArrayBuffer
): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(encrypted)
  if (bytes.length < 13) throw new Error('Invalid encrypted media')
  const iv = bytes.slice(0, 12)
  const data = bytes.slice(12)
  const key = await deriveKey(conversationId)
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(data)
  )
}