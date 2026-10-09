'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LettersPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [tab, setTab] = useState<'inbox' | 'send'>('inbox')
  const [letters, setLetters] = useState<any[]>([])
  const [toUsername, setToUsername] = useState('')
  const [body, setBody] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  const loadInbox = async (userId: string, username: string) => {
    const { data } = await supabase
      .from('letters')
      .select('*')
      .or(`to_id.eq.${userId},and(to_username.ilike.${username},read_at.is.null)`)
      .order('created_at', { ascending: false })
      .limit(30)

    // Simpler reliable load:
    const { data: byId } = await supabase
      .from('letters')
      .select('*')
      .eq('to_id', userId)
      .order('created_at', { ascending: false })

    const { data: byName } = await supabase
      .from('letters')
      .select('*')
      .ilike('to_username', username)
      .is('read_at', null)
      .order('created_at', { ascending: false })

    const map = new Map<string, any>()
    ;[...(byId || []), ...(byName || [])].forEach((l) => map.set(l.id, l))
    setLetters(Array.from(map.values()))
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

      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .maybeSingle()

      if (profile?.username) {
        await loadInbox(user.id, profile.username)
      }
      setLoading(false)
    }
    init()
  }, [])

  const sendLetter = async () => {
    setMessage('')
    if (!toUsername.trim() || !body.trim()) {
      setMessage('Username and message required')
      return
    }
    if (body.trim().length > 500) {
      setMessage('Max 500 characters')
      return
    }

    const { data: target } = await supabase
      .from('profiles')
      .select('id, username')
      .ilike('username', toUsername.trim())
      .maybeSingle()

    if (!target) {
      setMessage('User not found')
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
      setToUsername('')
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

    // Vanish after read
    await supabase.from('letters').delete().eq('id', letter.id)
    setLetters((prev) => prev.filter((l) => l.id !== letter.id))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white px-4 py-10">
      <div className="max-w-md mx-auto">
        <button
          onClick={() => router.push('/home')}
          className="text-sm text-zinc-400 hover:text-white mb-6"
        >
          ← Back to Home
        </button>

        <h1 className="text-3xl font-bold mb-6">Letters</h1>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab('inbox')}
            className={`flex-1 py-2 rounded-xl ${
              tab === 'inbox' ? 'bg-cyan-500 text-black' : 'bg-zinc-800'
            }`}
          >
            Inbox
          </button>
          <button
            onClick={() => setTab('send')}
            className={`flex-1 py-2 rounded-xl ${
              tab === 'send' ? 'bg-cyan-500 text-black' : 'bg-zinc-800'
            }`}
          >
            Send
          </button>
        </div>

        {tab === 'send' ? (
          <div className="space-y-3">
            <input
              value={toUsername}
              onChange={(e) => setToUsername(e.target.value)}
              placeholder="To username"
              className="w-full p-3 rounded-xl bg-zinc-900 border border-zinc-700"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 500))}
              placeholder="Write a letter (max 500)"
              rows={5}
              className="w-full p-3 rounded-xl bg-zinc-900 border border-zinc-700"
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
              <p className="text-zinc-500 text-center py-10">No letters</p>
            ) : (
              letters.map((l) => (
                <button
                  key={l.id}
                  onClick={() => openLetter(l)}
                  className="w-full text-left p-4 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-cyan-700"
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