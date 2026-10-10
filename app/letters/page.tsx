'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function extractInviteCode(input: string) {
  const raw = input.trim()
  if (!raw) return ''
  if (raw.includes('/i/')) {
    const part = raw.split('/i/')[1] || ''
    return part.split(/[?#]/)[0].trim().toLowerCase()
  }
  return raw.trim().toLowerCase()
}

export default function LettersPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [user, setUser] = useState<any>(null)
  const [tab, setTab] = useState<'inbox' | 'send'>('inbox')
  const [letters, setLetters] = useState<any[]>([])
  const [toInput, setToInput] = useState('')
  const [body, setBody] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [acceptedSafety, setAcceptedSafety] = useState(false)

  const loadInbox = async (userId: string) => {
    const { data } = await supabase
      .from('letters')
      .select('*')
      .eq('to_id', userId)
      .is('read_at', null)
      .order('created_at', { ascending: false })
    setLetters(data || [])
  }

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth')
        return
      }
      setUser(user)
      await loadInbox(user.id)

      // Prefill from vanish link choice
      if (typeof window !== 'undefined') {
        const pre = sessionStorage.getItem('letter_to')
        if (pre) {
          setToInput(pre)
          setTab('send')
          sessionStorage.removeItem('letter_to')
        }
      }
      if (searchParams.get('tab') === 'send') setTab('send')

      setLoading(false)
    }
    init()
  }, [])

  const resolveTarget = async (input: string) => {
    const trimmed = input.trim()
    if (!trimmed) return { error: 'Enter a username or vanish link' }

    if (trimmed.includes('/i/')) {
      const code = extractInviteCode(trimmed)
      const { data: invite } = await supabase
        .from('invites')
        .select('creator_id')
        .eq('code', code)
        .maybeSingle()
      if (!invite) return { error: 'Vanish link not found' }
      const { data: creator } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('id', invite.creator_id)
        .maybeSingle()
      if (!creator) return { error: 'User not available' }
      return { target: creator }
    }

    const { data: byName } = await supabase
      .from('profiles')
      .select('id, username')
      .ilike('username', trimmed)
      .maybeSingle()

    if (byName) return { target: byName }

    const code = extractInviteCode(trimmed)
    if (code.length >= 6) {
      const { data: invite } = await supabase
        .from('invites')
        .select('creator_id')
        .eq('code', code)
        .maybeSingle()
      if (invite) {
        const { data: creator } = await supabase
          .from('profiles')
          .select('id, username')
          .eq('id', invite.creator_id)
          .maybeSingle()
        if (creator) return { target: creator }
      }
    }

    return { error: 'User not found' }
  }

  const isBlockedEitherWay = async (a: string, b: string) => {
    const { data } = await supabase
      .from('blocks')
      .select('id')
      .or(
        `and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`
      )
      .limit(1)
    return !!(data && data.length)
  }

  const sendLetter = async () => {
    setMessage('')
    if (!user) return
    if (!acceptedSafety) {
      setMessage('Please confirm the safety note first')
      return
    }
    if (!toInput.trim() || !body.trim()) {
      setMessage('Recipient and message required')
      return
    }
    if (body.trim().length > 500) {
      setMessage('Max 500 characters')
      return
    }

    const resolved = await resolveTarget(toInput)
    if (resolved.error || !resolved.target) {
      setMessage(resolved.error || 'User not found')
      return
    }

    const target = resolved.target
    if (target.id === user.id) {
      setMessage('You cannot send a letter to yourself')
      return
    }

    if (await isBlockedEitherWay(user.id, target.id)) {
      setMessage('You cannot send a letter to this user')
      return
    }

    const { error } = await supabase.from('letters').insert({
      from_id: user.id,
      to_username: target.username,
      to_id: target.id,
      body: body.trim(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })

    if (error) setMessage(error.message)
    else {
      setMessage('Letter sent (they can read it once).')
      setBody('')
      setToInput('')
    }
  }

  const openLetter = async (letter: any) => {
    if (letter.read_at) {
      alert('Already read — gone.')
      return
    }
    if (new Date(letter.expires_at).getTime() < Date.now()) {
      alert('Letter expired.')
      await supabase.from('letters').delete().eq('id', letter.id)
      setLetters((prev) => prev.filter((l) => l.id !== letter.id))
      return
    }
    alert(letter.body)
    await supabase
      .from('letters')
      .update({ read_at: new Date().toISOString() })
      .eq('id', letter.id)
    await supabase.from('letters').delete().eq('id', letter.id)
    setLetters((prev) => prev.filter((l) => l.id !== letter.id))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[520px] h-[400px] bg-cyan-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 right-0 w-[300px] h-[300px] bg-blue-600/10 blur-[100px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-md mx-auto px-4 py-10">
        <button
          onClick={() => router.push('/home')}
          className="inline-flex items-center gap-2 text-sm font-medium text-cyan-400 border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 px-4 py-2.5 rounded-full mb-8 transition"
        >
          ← Back to Home
        </button>

        <h1 className="text-3xl font-bold mb-2">Letters</h1>
        <p className="text-zinc-500 text-sm mb-6">
          One-time notes. Read once, then gone.
        </p>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab('inbox')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${
              tab === 'inbox'
                ? 'bg-cyan-500 text-black'
                : 'bg-zinc-900 border border-zinc-800'
            }`}
          >
            Inbox {letters.length > 0 ? `(${letters.length})` : ''}
          </button>
          <button
            onClick={() => setTab('send')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${
              tab === 'send'
                ? 'bg-cyan-500 text-black'
                : 'bg-zinc-900 border border-zinc-800'
            }`}
          >
            Send
          </button>
        </div>

        {tab === 'send' ? (
          <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur-sm">
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
              <p className="text-xs text-amber-100/90 mb-2 font-medium">Safety</p>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Do not share passwords or send money. If a note feels wrong, leave
                and use Report on that user from chat or search when you can.
              </p>
              <label className="flex items-start gap-2 mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptedSafety}
                  onChange={(e) => setAcceptedSafety(e.target.checked)}
                  className="mt-0.5 accent-cyan-500"
                />
                <span className="text-[11px] text-zinc-300">I understand</span>
              </label>
            </div>

            <input
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              placeholder="Username or vanish link"
              className="w-full p-3 rounded-xl bg-black/40 border border-zinc-700 text-sm"
            />
            <p className="text-[11px] text-zinc-500">
              Example: shadow_42 or https://yoursite.com/i/x7k2m9
            </p>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 500))}
              placeholder="Write a one-time letter (max 500)"
              rows={5}
              className="w-full p-3 rounded-xl bg-black/40 border border-zinc-700 text-sm"
            />
            <p className="text-xs text-zinc-500">{body.length}/500</p>
            <button
              onClick={sendLetter}
              className="w-full bg-cyan-500 text-black font-medium py-3 rounded-xl"
            >
              Send letter
            </button>
            {message && (
              <p className="text-center text-sm text-cyan-400">{message}</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {letters.length === 0 ? (
              <p className="text-zinc-500 text-center py-16">No letters</p>
            ) : (
              letters.map((l) => (
                <button
                  key={l.id}
                  onClick={() => openLetter(l)}
                  className="w-full text-left p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 hover:border-cyan-700 transition"
                >
                  <p className="text-sm text-cyan-400">Tap to read once</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    {new Date(l.created_at).toLocaleString()}
                  </p>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}