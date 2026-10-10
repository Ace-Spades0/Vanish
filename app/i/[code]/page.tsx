'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function InviteLandingPage() {
  const params = useParams()
  const code = (params.code as string)?.trim().toLowerCase()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creator, setCreator] = useState<any>(null)
  const [inviteId, setInviteId] = useState<string | null>(null)
  const [acceptedSafety, setAcceptedSafety] = useState(false)
  const [acting, setActing] = useState(false)

  useEffect(() => {
    const load = async () => {
      if (!code) {
        setError('Invalid link')
        setLoading(false)
        return
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        // After login, return here
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('vanish_return_to', `/i/${code}`)
        }
        router.push('/auth')
        return
      }

      const { data: invite, error: invErr } = await supabase
        .from('invites')
        .select('*')
        .eq('code', code)
        .maybeSingle()

      if (invErr || !invite) {
        setError('This vanish link was not found.')
        setLoading(false)
        return
      }

      if (invite.used_at) {
        setError('This link was already used and has vanished.')
        setLoading(false)
        return
      }

      if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
        setError('This link has expired.')
        setLoading(false)
        return
      }

      if (invite.creator_id === user.id) {
        setError('This is your own link.')
        setLoading(false)
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, username, avatar_icon, bio, is_offline, status')
        .eq('id', invite.creator_id)
        .maybeSingle()

      if (!profile || profile.status === 'banned' || profile.status === 'suspended') {
        setError('User not available.')
        setLoading(false)
        return
      }

      // Block check
      const { data: blocks } = await supabase
        .from('blocks')
        .select('id')
        .or(
          `and(blocker_id.eq.${user.id},blocked_id.eq.${profile.id}),and(blocker_id.eq.${profile.id},blocked_id.eq.${user.id})`
        )
        .limit(1)

      if (blocks && blocks.length > 0) {
        setError('You cannot contact this user.')
        setLoading(false)
        return
      }

      setCreator(profile)
      setInviteId(invite.id)
      setLoading(false)
    }

    load()
  }, [code])

  const markUsed = async () => {
    if (!inviteId) return
    await supabase
      .from('invites')
      .update({ used_at: new Date().toISOString() })
      .eq('id', inviteId)
  }

  const startChat = async () => {
    if (!acceptedSafety || !creator?.username) return
    setActing(true)
    await markUsed()
    router.push(`/chat/${creator.username}`)
  }

  const sendLetter = async () => {
    if (!acceptedSafety || !creator?.username) return
    setActing(true)
    await markUsed()
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('letter_to', creator.username)
    }
    router.push('/letters?tab=send')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6 text-center">
        <p className="text-zinc-300 mb-6 max-w-sm">{error}</p>
        <button
          onClick={() => router.push('/home')}
          className="px-5 py-2.5 rounded-full bg-cyan-500 text-black font-medium"
        >
          Go Home
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[480px] h-[480px] bg-cyan-500/10 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-md mx-auto px-5 py-12">
        <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500 mb-3 text-center">
          Vanish link
        </p>
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">{creator?.avatar_icon || '🎭'}</div>
          <h1 className="text-3xl font-bold text-cyan-400">{creator?.username}</h1>
          {creator?.bio && (
            <p className="text-sm text-zinc-500 mt-2">{creator.bio}</p>
          )}
          <p className="text-xs text-zinc-500 mt-3">
            One use · then this link dies
          </p>
        </div>

        {/* Safety notice */}
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 mb-6 text-left">
          <p className="text-sm font-medium text-amber-200 mb-2">Before you continue</p>
          <ul className="text-xs text-zinc-400 space-y-1.5 list-disc pl-4">
            <li>Do not share passwords, codes, or money requests.</li>
            <li>You can leave or clear the chat at any time.</li>
            <li>If something feels wrong, use Report — we review reports.</li>
            <li>Messages and letters are temporary by design.</li>
          </ul>
          <label className="flex items-start gap-2 mt-4 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptedSafety}
              onChange={(e) => setAcceptedSafety(e.target.checked)}
              className="mt-0.5 accent-cyan-500"
            />
            <span className="text-xs text-zinc-300">
              I understand and want to continue
            </span>
          </label>
        </div>

        <div className="space-y-3">
          <button
            onClick={startChat}
            disabled={!acceptedSafety || acting}
            className="w-full py-3.5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-black font-semibold transition"
          >
            Start a vanishing chat
          </button>
          <button
            onClick={sendLetter}
            disabled={!acceptedSafety || acting}
            className="w-full py-3.5 rounded-2xl border border-zinc-700 bg-zinc-900 hover:border-cyan-500/40 disabled:opacity-40 text-white font-medium transition"
          >
            Send a one-time letter
          </button>
          <button
            onClick={() => router.push('/home')}
            className="w-full py-2 text-sm text-zinc-500 hover:text-zinc-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}