type Entry = { count: number; resetAt: number }

const store = new Map<string, Entry>()

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; remaining: number } {
  const now = Date.now()
  const cur = store.get(key)

  if (!cur || cur.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, remaining: limit - 1 }
  }

  if (cur.count >= limit) {
    return { ok: false, remaining: 0 }
  }

  cur.count += 1
  store.set(key, cur)
  return { ok: true, remaining: limit - cur.count }
}

export function clientKey(req: Request, userId?: string) {
  const fwd = req.headers.get('x-forwarded-for') || ''
  const ip = fwd.split(',')[0]?.trim() || 'unknown'
  return userId ? `${userId}:${ip}` : ip
}