'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function InvitePage() {
  const params = useParams()
  const code = params.code as string
  const router = useRouter()
  const [message, setMessage] = useState('Opening invite...')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const run = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/auth')
        return
      }

      const { data: invite, error } = await supabase
        .from('invites')
        .select('*')
        .eq('code', code)
        .maybeSingle()

      if (error || !invite) {
        setMessage('Invite not found.')
        setLoading(false)
        return
      }

      if (invite.used_at) {
        setMessage('This invite was already used.')
        setLoading(false)
        return
      }

      if (new Date(invite.expires_at).getTime() < Date.now()) {
        setMessage('This invite has expired.')
        setLoading(false)
        return
      }

      if (invite.creator_id === user.id) {
        setMessage('You cannot use your own invite.')
        setLoading(false)
        return
      }

      const { data: creator } = await supabase
        .from('profiles')
        .select('username, username_claimed_at, is_permanent_username, is_offline')
        .eq('id', invite.creator_id)
        .maybeSingle()

      if (!creator?.username || creator.is_offline) {
        setMessage('Creator is not available right now.')
        setLoading(false)
        return
      }

      const active =
        creator.is_permanent_username ||
        (creator.username_claimed_at &&
          (Date.now() - new Date(creator.username_claimed_at).getTime()) /
            3600000 <
            24)

      if (!active) {
        setMessage('Creator username is not active.')
        setLoading(false)
        return
      }

      await supabase
        .from('invites')
        .update({ used_by: user.id, used_at: new Date().toISOString() })
        .eq('id', invite.id)

      router.replace(`/chat/${creator.username}`)
    }

    run()
  }, [code])

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 text-center">
      <div>
        <p className="text-zinc-300 mb-4">{message}</p>
        {!loading && (
          <button
            onClick={() => router.push('/home')}
            className="bg-zinc-700 px-5 py-2 rounded-xl"
          >
            Home
          </button>
        )}
      </div>
    </div>
  )
}