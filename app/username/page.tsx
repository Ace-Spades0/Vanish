'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { peekReturnTo, takeReturnTo } from '@/lib/returnTo'

export default function UsernamePage() {
  const router = useRouter()
  const [message, setMessage] = useState('Setting up…')

  useEffect(() => {
    const run = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('username, username_claimed_at, is_permanent_username, status')
        .eq('id', user.id)
        .maybeSingle()

      if (profile?.status === 'banned' || profile?.status === 'suspended') {
        router.replace('/appeal')
        return
      }

      const hasName = !!profile?.username
      let active = !!profile?.is_permanent_username
      if (hasName && profile?.username_claimed_at && !active) {
        const hours =
          (Date.now() - new Date(profile.username_claimed_at).getTime()) /
          (1000 * 60 * 60)
        active = hours < 24
      }

      if (hasName && active) {
        const ret = takeReturnTo() || peekReturnTo()
        if (ret) {
          try {
            sessionStorage.removeItem('vanish_return_to')
            localStorage.removeItem('vanish_return_to')
          } catch {
            /* ignore */
          }
          router.replace(ret)
          return
        }
        router.replace('/home')
        return
      }

      setMessage('Redirecting…')
      await supabase.auth.signOut()
      router.replace('/')
    }

    run()
  }, [router])

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <p className="text-zinc-400 text-sm">{message}</p>
    </div>
  )
}