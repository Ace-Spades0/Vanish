const APP_SALT = 'go-vanish-v1-e2ee-salt'

function toBase64(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i])
  return btoa(s)
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64)
  const u8 = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i)
  return u8
}

/** Copy into a plain ArrayBuffer so TS accepts BufferSource */
function asBufferSource(u8: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(u8.byteLength)
  copy.set(u8)
  return copy.buffer
}

async function deriveKey(conversationId: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const material = await crypto.subtle.importKey(
    'raw',
    enc.encode(`${APP_SALT}:${conversationId}`),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(APP_SALT),
      iterations: 100000,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/** Returns payload: v1.<iv_b64>.<cipher_b64> */
export async function encryptText(
  conversationId: string,
  plain: string
): Promise<string> {
  const key = await deriveKey(conversationId)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: asBufferSource(iv) },
    key,
    new TextEncoder().encode(plain)
  )
  return `v1.${toBase64(asBufferSource(iv))}.${toBase64(cipher)}`
}

export async function decryptText(
  conversationId: string,
  payload: string
): Promise<string> {
  if (!payload.startsWith('v1.')) return payload
  const parts = payload.split('.')
  if (parts.length !== 3) return payload
  try {
    const key = await deriveKey(conversationId)
    const iv = fromBase64(parts[1])
    const data = fromBase64(parts[2])
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: asBufferSource(iv) },
      key,
      asBufferSource(data)
    )
    return new TextDecoder().decode(plain)
  } catch {
    return '[Unable to decrypt]'
  }
}

export function looksEncrypted(text: string | null | undefined): boolean {
  return !!text && text.startsWith('v1.')
}