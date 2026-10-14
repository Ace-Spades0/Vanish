'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type ActiveChat = {
  conversationId: string
  otherUsername: string
  lastAt: string
}

export default function ActiveChatsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [ending, setEnding] = useState<string | null>(null)
  const [chats, setChats] = useState<ActiveChat[]>([])

  const load = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      router.push('/auth')
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile?.username) {
      router.push('/username')
      return
    }

    const nowIso = new Date().toISOString()
    const { data: rows } = await supabase
      .from('messages')
      .select('conversation_id, created_at, expires_at, deleted')
      .eq('deleted', false)
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: false })
      .limit(400)

    const map = new Map<string, ActiveChat>()
    const me = profile.username.toLowerCase()
    for (const r of rows || []) {
      const cid = r.conversation_id as string
      if (!cid || map.has(cid)) continue
      const parts = cid.split('_')
      if (parts.length < 2) continue
      const a = parts[0].toLowerCase()
      const b = parts.slice(1).join('_').toLowerCase()
      let other = ''
      if (a === me) other = parts.slice(1).join('_')
      else if (b === me) other = parts[0]
      else continue
      map.set(cid, {
        conversationId: cid,
        otherUsername: other,
        lastAt: r.created_at,
      })
    }
    setChats(Array.from(map.values()))
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const endChat = async (conversationId: string) => {
    setEnding(conversationId)
    await supabase
      .from('messages')
      .update({ deleted: true })
      .eq('conversation_id', conversationId)
    setChats((prev) => prev.filter((c) => c.conversationId !== conversationId))
    setEnding(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-zinc-400">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white px-4 py-8">
      <div className="max-w-md mx-auto">
        <button
          onClick={() => router.push('/search')}
          className="mb-6 h-12 px-5 rounded-xl bg-zinc-800 border-2 border-cyan-500/40 text-cyan-300 font-bold"
        >
          ← Back to Search
        </button>
        <h1 className="text-2xl font-bold mb-1">Active chats</h1>
        <p className="text-zinc-500 text-sm mb-6">
          Chats still in time. Tap name to open. End chat to vanish it.
        </p>
        {chats.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-10 text-center">
            <p className="text-zinc-400">No active chat</p>
            <p className="text-zinc-600 text-sm mt-2">
              When you have open chats that have not vanished, they show here.
            </p>
            <button
              onClick={() => router.push('/search')}
              className="mt-6 w-full bg-cyan-500 text-black font-medium py-3 rounded-xl"
            >
              Search users
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {chats.map((c) => (
              <div
                key={c.conversationId}
                className="flex items-center gap-3 p-4 rounded-2xl bg-zinc-900 border border-zinc-800"
              >
                <button
                  type="button"
                  onClick={() => router.push(`/chat/${c.otherUsername}`)}
                  className="flex-1 text-left min-w-0"
                >
                  <p className="text-cyan-400 font-semibold text-lg truncate">
                    {c.otherUsername}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {new Date(c.lastAt).toLocaleString()}
                  </p>
                </button>
                <button
                  type="button"
                  disabled={ending === c.conversationId}
                  onClick={() => endChat(c.conversationId)}
                  className="shrink-0 text-xs font-semibold bg-red-600 px-3 py-2 rounded-xl disabled:opacity-50"
                >
                  {ending === c.conversationId ? '…' : 'End chat'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}