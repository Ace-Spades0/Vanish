const CACHE_NAME = 'go-vanish-pwa-v3'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(['/', '/logo.png', '/icon-192.png', '/icon-512.png']).catch(() => {})
    )
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.pathname.startsWith('/api/')) return
  if (url.hostname.includes('supabase')) return

  event.respondWith(
    fetch(req)
      .then((res) => res)
      .catch(() => caches.match(req).then((c) => c || caches.match('/')))
  )
})