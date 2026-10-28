'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type ActiveChat = {
  conversationId: string
  otherUsername: string
  otherId: string
  lastAt: string
}

export default function ActiveChatsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [chats, setChats] = useState<ActiveChat[]>([])
  const [loading, setLoading] = useState(true)
  const [ending, setEnding] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  const loadChats = async (uid: string) => {
    setMessage('')

    // Same idea as before: conversations where I am either side
    const { data: convs, error } = await supabase
      .from('conversations')
      .select('*')
      .or(`user_a.eq.${uid},user_b.eq.${uid}`)
      .order('updated_at', { ascending: false })
      .limit(50)

    let rows = convs || []

    // Fallback if user_a / user_b names differ in your project
    if (error || rows.length === 0) {
      const { data: all, error: err2 } = await supabase
        .from('conversations')
        .select('*')
        .limit(80)

      if (err2) {
        setMessage(error?.message || err2.message)
        setChats([])
        return
      }

      rows = (all || []).filter((c: any) => {
        const a = c.user_a ?? c.user1 ?? c.participant_a
        const b = c.user_b ?? c.user2 ?? c.participant_b
        if (a === uid || b === uid) return true
        if (Array.isArray(c.participant_ids)) {
          return c.participant_ids.includes(uid)
        }
        return false
      })
    }

    const now = Date.now()
    const alive = rows.filter((c: any) => {
      if (c.died_at) return false
      if (c.expires_at && new Date(c.expires_at).getTime() <= now) return false
      if (c.ends_at && new Date(c.ends_at).getTime() <= now) return false
      return true
    })

    if (alive.length === 0) {
      setChats([])
      return
    }

    const otherIds = alive
      .map((c: any) => {
        const a = c.user_a ?? c.user1 ?? c.participant_a
        const b = c.user_b ?? c.user2 ?? c.participant_b
        if (a === uid) return b
        if (b === uid) return a
        if (Array.isArray(c.participant_ids)) {
          return c.participant_ids.find((id: string) => id !== uid)
        }
        return null
      })
      .filter(Boolean) as string[]

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', otherIds.length ? otherIds : ['00000000-0000-0000-0000-000000000000'])

    const nameMap: Record<string, string> = {}
    ;(profiles || []).forEach((p) => {
      nameMap[p.id] = p.username || 'Unknown'
    })

    const mapped: ActiveChat[] = alive
      .map((c: any) => {
        const a = c.user_a ?? c.user1 ?? c.participant_a
        const b = c.user_b ?? c.user2 ?? c.participant_b
        let otherId = a === uid ? b : b === uid ? a : null
        if (!otherId && Array.isArray(c.participant_ids)) {
          otherId = c.participant_ids.find((id: string) => id !== uid) || null
        }
        return {
          conversationId: c.id,
          otherId: otherId || '',
          otherUsername: otherId ? nameMap[otherId] || 'Unknown' : 'Unknown',
          lastAt:
            c.updated_at ||
            c.last_message_at ||
            c.created_at ||
            new Date().toISOString(),
        }
      })
      .filter((c) => c.otherId && c.otherUsername !== 'Unknown')
      .sort(
        (x, y) =>
          new Date(y.lastAt).getTime() - new Date(x.lastAt).getTime()
      )

    setChats(mapped)
  }

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/')
        return
      }
      setUserId(user.id)
      await loadChats(user.id)
      setLoading(false)
    }
    init()
  }, [router])

  const openChat = (username: string) => {
    if (!username || username === 'Unknown') return
    router.push(`/chat/${username}`)
  }

  const endChat = async (conversationId: string) => {
    if (!userId) return
    setEnding(conversationId)
    const now = new Date().toISOString()

    await supabase
      .from('conversations')
      .update({ expires_at: now })
      .eq('id', conversationId)

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
          className="mb-6 text-sm font-medium text-cyan-400 hover:text-cyan-300 px-3 py-2 rounded-xl border border-cyan-700/50 bg-zinc-900"
        >
          ← Back
        </button>

        <h1 className="text-2xl font-bold mb-2">Active chats</h1>
        <p className="text-zinc-500 text-sm mb-6">
          Chats that have not vanished yet. Tap a name to open. End chat closes
          it for the conversation.
        </p>

        {message && (
          <p className="text-xs text-amber-400 mb-4 break-words">{message}</p>
        )}

        {chats.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
            <p className="text-zinc-500 text-sm">No active chats</p>
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
                  onClick={() => openChat(c.otherUsername)}
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