'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { peekReturnTo, takeReturnTo } from '@/lib/returnTo'
import { generateKeyPair, exportPublicKey, exportPrivateKey } from '@/lib/e2ee'

export default function UsernamePage() {
  const router = useRouter()
  const [message, setMessage] = useState('Setting up…')

  useEffect(() => {
    const run = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/'); return }

      const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()

      if (error) {
        setMessage("Database error: " + error.message)
        return
      }

      if (profile?.status === 'banned' || profile?.status === 'suspended') { router.replace('/appeal'); return }

      const hasName = !!profile?.username
      let active = !!profile?.is_permanent_username
      if (hasName && profile?.username_claimed_at && !active) {
        const hours = (Date.now() - new Date(profile.username_claimed_at).getTime()) / (1000 * 60 * 60)
        active = hours < 24
      }

      if (hasName && active) {
        // Generate ECDH Keys if they don't exist
        if (!localStorage.getItem('vanish_priv_key')) {
          try {
            const pair = await generateKeyPair()
            const exportedPub = await exportPublicKey(pair.publicKey)
            const exportedPriv = await exportPrivateKey(pair.privateKey)
            localStorage.setItem('vanish_priv_key', JSON.stringify(exportedPriv))
            await supabase.from('profiles').update({ public_key: exportedPub }).eq('id', user.id)
          } catch (e) {
            console.error("Failed to generate keys", e)
          }
        }

        const ret = takeReturnTo() || peekReturnTo()
        if (ret) {
          try {
            sessionStorage.removeItem('vanish_return_to')
            localStorage.removeItem('vanish_return_to')
          } catch { /* ignore */ }
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