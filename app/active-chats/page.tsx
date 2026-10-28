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
  const [user, setUser] = useState<any>(null)
  const [chats, setChats] = useState<ActiveChat[]>([])
  const [loading, setLoading] = useState(true)
  const [ending, setEnding] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  const loadChats = async (userId: string) => {
    const { data: convs, error } = await supabase
      .from('conversations')
      .select('id, user_a, user_b, updated_at, created_at, expires_at, sealed, died_at')
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .order('updated_at', { ascending: false })
      .limit(50)

    if (error) {
      // Fallback if column names differ
      const { data: convs2, error: err2 } = await supabase
        .from('conversations')
        .select('*')
        .limit(50)

      if (err2 || !convs2) {
        setChats([])
        setMessage(error.message || err2?.message || '')
        return
      }

      const mine = convs2.filter((c: any) => {
        const a = c.user_a || c.user1 || c.participant_a || c.member_a
        const b = c.user_b || c.user2 || c.participant_b || c.member_b
        return a === userId || b === userId
      })

      await mapConversations(userId, mine)
      return
    }

    const now = Date.now()
    const alive = (convs || []).filter((c: any) => {
      if (c.died_at) return false
      if (c.expires_at && new Date(c.expires_at).getTime() <= now) return false
      return true
    })

    await mapConversations(userId, alive)
  }

  const mapConversations = async (userId: string, list: any[]) => {
    if (!list.length) {
      setChats([])
      return
    }

    const otherIds = list
      .map((c) => {
        const a = c.user_a || c.user1 || c.participant_a
        const b = c.user_b || c.user2 || c.participant_b
        return a === userId ? b : a
      })
      .filter(Boolean)

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', otherIds)

    const nameMap: Record<string, string> = {}
    ;(profiles || []).forEach((p) => {
      nameMap[p.id] = p.username || 'Unknown'
    })

    const mapped: ActiveChat[] = list.map((c) => {
      const a = c.user_a || c.user1 || c.participant_a
      const b = c.user_b || c.user2 || c.participant_b
      const otherId = a === userId ? b : a
      return {
        conversationId: c.id,
        otherId,
        otherUsername: nameMap[otherId] || 'Unknown',
        lastAt: c.updated_at || c.created_at || new Date().toISOString(),
      }
    })

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
      setUser(user)
      await loadChats(user.id)
      setLoading(false)
    }
    init()
  }, [router])

  const endChat = async (conversationId: string) => {
    if (!user) return
    setEnding(conversationId)
    const now = new Date().toISOString()

    await supabase
      .from('conversations')
      .update({ expires_at: now, died_at: now })
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
          Chats that have not vanished yet. Tap a name to open. End chat closes it
          now.
        </p>

        {message && (
          <p className="text-xs text-amber-400 mb-4">{message}</p>
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