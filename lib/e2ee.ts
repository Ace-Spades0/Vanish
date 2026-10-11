function b64ToBytes(b64: string) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToB64(bytes: ArrayBuffer | Uint8Array) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i])
  return btoa(s)
}

/** Derive a key from conversationId + both user ids (demo secret). */
export async function deriveChatKey(
  conversationId: string,
  userA: string,
  userB: string
): Promise<CryptoKey> {
  const sorted = [userA, userB].sort().join(':')
  const material = new TextEncoder().encode(`${conversationId}:${sorted}:govanish-v1`)
  const hash = await crypto.subtle.digest('SHA-256', material)
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptText(key: CryptoKey, plaintext: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  return `e2ee:v1:${bytesToB64(iv)}:${bytesToB64(cipher)}`
}

export async function decryptText(key: CryptoKey, payload: string) {
  if (!payload.startsWith('e2ee:v1:')) return payload
  const [, , ivB64, dataB64] = payload.split(':')
  const iv = b64ToBytes(ivB64)
  const data = b64ToBytes(dataB64)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return new TextDecoder().decode(plain)
}