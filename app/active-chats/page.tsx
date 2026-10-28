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
  const [chats, setChats] = useState<ActiveChat[]>([])
  const [loading, setLoading] = useState(true)
  const [ending, setEnding] = useState<string | null>(null)
  const [hint, setHint] = useState('')

  const loadChats = async (uid: string) => {
    setHint('')

    // All messages RLS allows you to see (sent by you OR by the other person)
    const { data: msgs, error: msgErr } = await supabase
      .from('messages')
      .select(
        'id, conversation_id, sender_id, created_at, expires_at, deleted'
      )
      .order('created_at', { ascending: false })
      .limit(500)

    if (msgErr) {
      setHint(msgErr.message)
      setChats([])
      return
    }

    if (!msgs || msgs.length === 0) {
      setHint(
        'No messages visible yet. If someone wrote to you and this stays empty, message RLS may block received messages.'
      )
      setChats([])
      return
    }

    const now = Date.now()
    type Acc = {
      lastAt: string
      senders: Set<string>
    }
    const map = new Map<string, Acc>()

    for (const m of msgs) {
      if (!m.conversation_id) continue
      if (m.deleted === true) continue
      if (m.expires_at && new Date(m.expires_at).getTime() <= now) continue

      const existing = map.get(m.conversation_id)
      if (!existing) {
        map.set(m.conversation_id, {
          lastAt: m.created_at,
          senders: new Set([m.sender_id]),
        })
      } else {
        existing.senders.add(m.sender_id)
        if (
          new Date(m.created_at).getTime() >
          new Date(existing.lastAt).getTime()
        ) {
          existing.lastAt = m.created_at
        }
      }
    }

    // Merge conversation rows if present (both participants)
    const { data: convRows } = await supabase
      .from('conversations')
      .select('*')
      .limit(100)

    for (const c of convRows || []) {
      if (!c?.id) continue
      if (c.died_at) continue
      if (c.expires_at && new Date(c.expires_at).getTime() <= now) continue

      const a = c.user_a ?? c.user1 ?? c.participant_a
      const b = c.user_b ?? c.user2 ?? c.participant_b
      const inPair = a === uid || b === uid
      const inList =
        Array.isArray(c.participant_ids) && c.participant_ids.includes(uid)
      if (!inPair && !inList) continue

      if (!map.has(c.id)) {
        const senders = new Set<string>()
        if (a) senders.add(a)
        if (b) senders.add(b)
        if (Array.isArray(c.participant_ids)) {
          c.participant_ids.forEach((id: string) => senders.add(id))
        }
        map.set(c.id, {
          lastAt:
            c.updated_at ||
            c.last_message_at ||
            c.created_at ||
            new Date().toISOString(),
          senders,
        })
      } else {
        const acc = map.get(c.id)!
        if (a) acc.senders.add(a)
        if (b) acc.senders.add(b)
      }
    }

    if (map.size === 0) {
      setChats([])
      return
    }

    const otherIds: string[] = []
    const pending: {
      conversationId: string
      otherId: string
      lastAt: string
    }[] = []

    map.forEach((acc, conversationId) => {
      let otherId = ''
      acc.senders.forEach((id) => {
        if (id && id !== uid) otherId = id
      })
      if (!otherId) return
      otherIds.push(otherId)
      pending.push({
        conversationId,
        otherId,
        lastAt: acc.lastAt,
      })
    })

    if (pending.length === 0) {
      setHint(
        'Found conversations but could not detect the other user. Check conversations user columns.'
      )
      setChats([])
      return
    }

    const uniqueOthers = Array.from(new Set(otherIds))
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', uniqueOthers)

    const nameMap: Record<string, string> = {}
    ;(profiles || []).forEach((p) => {
      nameMap[p.id] = p.username || 'Unknown'
    })

    const list: ActiveChat[] = pending
      .map((p) => ({
        conversationId: p.conversationId,
        otherId: p.otherId,
        otherUsername: nameMap[p.otherId] || 'Unknown',
        lastAt: p.lastAt,
      }))
      .filter((c) => c.otherUsername && c.otherUsername !== 'Unknown')
      .sort(
        (a, b) =>
          new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
      )

    setChats(list)
    if (list.length === 0) {
      setHint(
        'Other users have no active username on profiles, so names could not be shown.'
      )
    }
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
    setEnding(conversationId)
    const now = new Date().toISOString()

    await supabase
      .from('conversations')
      .update({ expires_at: now })
      .eq('id', conversationId)

    await supabase
      .from('messages')
      .update({ deleted: true, expires_at: now })
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
          If someone messaged you and the chat is still alive, it appears here.
          Tap to open. End chat closes it.
        </p>

        {hint && (
          <p className="text-xs text-amber-400 mb-4 break-words">{hint}</p>
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