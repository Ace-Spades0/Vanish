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

    // 1. Load conversations that involve this user only
    //    (supports common column shapes used in your app)
    const { data: convRows, error: convErr } = await supabase
      .from('conversations')
      .select('*')
      .or(
        `user_a.eq.${uid},user_b.eq.${uid},user1.eq.${uid},user2.eq.${uid},participant_a.eq.${uid},participant_b.eq.${uid}`
      )
      .is('died_at', null)
      .limit(50)

    if (convErr) {
      // Fallback: load a small set and filter client-side (in case .or() columns differ)
      const { data: allConv } = await supabase
        .from('conversations')
        .select('*')
        .limit(100)

      const now = Date.now()
      const filtered = (allConv || []).filter((c: any) => {
        if (c.died_at) return false
        if (c.expires_at && new Date(c.expires_at).getTime() <= now) return false
        const a = c.user_a ?? c.user1 ?? c.participant_a
        const b = c.user_b ?? c.user2 ?? c.participant_b
        const inPair = a === uid || b === uid
        const inList =
          Array.isArray(c.participant_ids) && c.participant_ids.includes(uid)
        return inPair || inList
      })

      await buildChatList(uid, filtered)
      return
    }

    const now = Date.now()
    const alive = (convRows || []).filter((c: any) => {
      if (c.expires_at && new Date(c.expires_at).getTime() <= now) return false
      return true
    })

    await buildChatList(uid, alive)
  }

  const buildChatList = async (uid: string, convRows: any[]) => {
    if (!convRows.length) {
      setChats([])
      return
    }

    // 2. Resolve the other participant for each conversation
    const pending: {
      conversationId: string
      otherId: string
      lastAt: string
    }[] = []

    for (const c of convRows) {
      const a = c.user_a ?? c.user1 ?? c.participant_a ?? null
      const b = c.user_b ?? c.user2 ?? c.participant_b ?? null

      let otherId = ''
      if (a && a !== uid) otherId = a
      else if (b && b !== uid) otherId = b
      else if (Array.isArray(c.participant_ids)) {
        otherId = c.participant_ids.find((id: string) => id && id !== uid) || ''
      }

      if (!otherId) continue

      pending.push({
        conversationId: c.id,
        otherId,
        lastAt:
          c.updated_at ||
          c.last_message_at ||
          c.created_at ||
          new Date().toISOString(),
      })
    }

    if (pending.length === 0) {
      setHint(
        'Found conversations but could not detect the other user. Check conversations user columns (user_a/user_b or participant_ids).'
      )
      setChats([])
      return
    }

    // 3. Enrich with latest non-deleted, non-expired message time (optional but better UX)
    const convIds = pending.map((p) => p.conversationId)
    const { data: msgs } = await supabase
      .from('messages')
      .select('conversation_id, created_at, expires_at, deleted')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false })
      .limit(300)

    const now = Date.now()
    const lastMsgMap = new Map<string, string>()
    for (const m of msgs || []) {
      if (m.deleted === true) continue
      if (m.expires_at && new Date(m.expires_at).getTime() <= now) continue
      if (!lastMsgMap.has(m.conversation_id)) {
        lastMsgMap.set(m.conversation_id, m.created_at)
      }
    }

    // 4. Load usernames of the other users
    const otherIds = Array.from(new Set(pending.map((p) => p.otherId)))
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', otherIds)

    const nameMap: Record<string, string> = {}
    ;(profiles || []).forEach((p) => {
      nameMap[p.id] = p.username || 'Unknown'
    })

    const list: ActiveChat[] = pending
      .map((p) => ({
        conversationId: p.conversationId,
        otherId: p.otherId,
        otherUsername: nameMap[p.otherId] || 'Unknown',
        lastAt: lastMsgMap.get(p.conversationId) || p.lastAt,
      }))
      // Only show chats where the other person still has a username
      .filter((c) => c.otherUsername && c.otherUsername !== 'Unknown')
      .sort(
        (a, b) =>
          new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
      )

    setChats(list)

    if (list.length === 0 && pending.length > 0) {
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
      .update({ expires_at: now, died_at: now })
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
          onClick={() => router.push('/home')}
          className="inline-flex items-center gap-2 text-sm font-medium text-cyan-400 border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 px-4 py-2.5 rounded-full mb-8 transition"
        >
          ← Back to Home
        </button>

        <h1 className="text-2xl font-bold mb-2">Active chats</h1>
        <p className="text-zinc-500 text-sm mb-6">
          If someone messaged you and the chat is still alive, it appears here.
          Tap to open. End chat closes it for both sides.
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