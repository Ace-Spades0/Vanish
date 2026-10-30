/** Deep-link after username: group / invite / chat */

export function saveReturnTo(path: string) {
  if (typeof window === 'undefined') return
  if (!path || !path.startsWith('/')) return
  sessionStorage.setItem('vanish_return_to', path)
}

export function peekReturnTo(): string | null {
  if (typeof window === 'undefined') return null
  const v = sessionStorage.getItem('vanish_return_to')
  if (!v || !v.startsWith('/')) return null
  return v
}

export function takeReturnTo(): string | null {
  if (typeof window === 'undefined') return null
  const v = sessionStorage.getItem('vanish_return_to')
  if (!v || !v.startsWith('/')) return null
  sessionStorage.removeItem('vanish_return_to')
  return v
}