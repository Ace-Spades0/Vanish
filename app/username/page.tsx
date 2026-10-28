'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

/**
 * Username is assigned on Get Started (random), not picked here.
 * Active name → /home
 * Expired / missing / no session → sign out → landing /
 */
export default function UsernamePage() {
  const router = useRouter()

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

      if (profile?.is_permanent_username && profile.username) {
        router.replace('/home')
        return
      }

      if (profile?.username && profile.username_claimed_at) {
        const hoursPassed =
          (Date.now() - new Date(profile.username_claimed_at).getTime()) /
          (1000 * 60 * 60)
        if (hoursPassed < 24) {
          router.replace('/home')
          return
        }
      }

      // Expired or no username → leave identity path → landing only
      await supabase.auth.signOut()
      router.replace('/')
    }

    run()
  }, [router])

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <p className="text-zinc-400 text-sm">Redirecting…</p>
    </div>
  )
}