'use client'

import { useEffect } from 'react'

export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        })
        await navigator.serviceWorker.ready
        console.log('VANISH SW registered', reg.scope)
      } catch (err) {
        console.error('VANISH SW failed', err)
      }
    }

    register()
  }, [])

  return null
}