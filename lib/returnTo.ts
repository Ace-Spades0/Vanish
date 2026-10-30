export function saveReturnTo(path: string) {
  if (typeof window === 'undefined') return
  if (!path || typeof path !== 'string') return
  if (!path.startsWith('/')) return
  try {
    sessionStorage.setItem('vanish_return_to', path)
    localStorage.setItem('vanish_return_to', path)
  } catch {
    /* ignore */
  }
}

export function peekReturnTo(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const a = sessionStorage.getItem('vanish_return_to')
    const b = localStorage.getItem('vanish_return_to')
    const v = a || b
    if (!v || !v.startsWith('/')) return null
    return v
  } catch {
    return null
  }
}

export function takeReturnTo(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const v = peekReturnTo()
    sessionStorage.removeItem('vanish_return_to')
    localStorage.removeItem('vanish_return_to')
    return v
  } catch {
    return null
  }
}