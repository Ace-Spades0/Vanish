'use client'

import { useEffect } from 'react'

export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker
      .register('/sw.js')
      .then(() => {
        // registered
      })
      .catch(() => {
        // ignore registration errors in dev
      })
  }, [])

  return null
}