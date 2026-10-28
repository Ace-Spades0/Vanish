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

function pickOtherId(row: any, userId: string): string | null {
  if (!row) return null
  const candidates = [
    row.user_a,
    row.user_b,
    row.user1,
    row.user2,
    row.participant_a,
    row.participant_b,
    row.member_a,
    row.member_b,
    row.owner_id,
    row.created_by,
    row.user_id,
    row.other_user_id,
  ].filter(Boolean)

  if (Array.isArray(row.participant_ids)) {
    const found = row.participant_ids.find((id: string) => id && id !== userId)
    if (found) return found
  }
  if (Array.isArray(row.members)) {
    const found = row.members.find((id: string) => id && id !== userId)
    if (found) return found
  }

  for (const id of candidates) {
    if (id && id !== userId) return id
  }
  return null
}

function isStillActive(row: any, lastAt?: string) {
  const now = Date.now()
  if (row?.died_at) return false
  if (row?.sealed === true && row?.cleared_at) return false
  if (row?.expires_at && new Date(row.expires_at).getTime() <= now) return false
  if (row?.ends_at && new Date(row.ends_at).getTime() <= now) return false
  // If no expiry on conversation, keep if last activity within 3 hours
  if (!row?.expires_at && !row?.ends_at && lastAt) {
    const age = now - new Date(lastAt).getTime()
    if (age > 3 * 60 * 60 * 1000) return false
  }
  return true
}

export default function ActiveChatsPage() {
  const router = useRouter()
  const [chats, setChats] = useState<ActiveChat[]>([])
  const [loading, setLoading] = useState(true)
  const [ending, setEnding] = useState<string | null>(null)
  const [debug, setDebug] = useState('')

  const loadChats = async (userId: string) => {
    const byConv: Record<
      string,
      { lastAt: string; otherId: string | null }
    > = {}

    // 1) Messages I sent
    const { data: sent, error: sentErr } = await supabase
      .from('messages')
      .select('conversation_id, sender_id, created_at, expires_at, deleted')
      .eq('sender_id', userId)
      .order('created_at', { ascending: false })
      .limit(300)

    if (sentErr) {
      setDebug(sentErr.message)
    }

    for (const m of sent || []) {
      if (!m.conversation_id) continue
      if (m.deleted) continue
      if (m.expires_at && new Date(m.expires_at).getTime() <= Date.now()) continue
      if (!byConv[m.conversation_id]) {
        byConv[m.conversation_id] = {
          lastAt: m.created_at,
          otherId: null,
        }
      }
    }

    // 2) Messages in those conversations (find the other person)
    const convIds = Object.keys(byConv)
    if (convIds.length > 0) {
      const { data: related } = await supabase
        .from('messages')
        .select('conversation_id, sender_id, created_at, expires_at, deleted')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false })
        .limit(500)

      for (const m of related || []) {
        if (!m.conversation_id || m.deleted) continue
        if (m.expires_at && new Date(m.expires_at).getTime() <= Date.now()) {
          continue
        }
        const slot = byConv[m.conversation_id]
        if (!slot) {
          byConv[m.conversation_id] = {
            lastAt: m.created_at,
            otherId: m.sender_id !== userId ? m.sender_id : null,
          }
        } else {
          if (new Date(m.created_at).getTime() > new Date(slot.lastAt).getTime()) {
            slot.lastAt = m.created_at
          }
          if (!slot.otherId && m.sender_id !== userId) {
            slot.otherId = m.sender_id
          }
        }
      }
    }

    // 3) Also try conversations table (any schema)
    const { data: allConvs } = await supabase
      .from('conversations')
      .select('*')
      .limit(100)

    for (const c of allConvs || []) {
      const otherId = pickOtherId(c, userId)
      const involvesMe =
        otherId ||
        c.user_a === userId ||
        c.user_b === userId ||
        c.user1 === userId ||
        c.user2 === userId ||
        (Array.isArray(c.participant_ids) && c.participant_ids.includes(userId))

      if (!involvesMe || !c.id) continue

      const lastAt = c.updated_at || c.last_message_at || c.created_at
      if (!isStillActive(c, lastAt)) continue

      if (!byConv[c.id]) {
        byConv[c.id] = {
          lastAt: lastAt || new Date().toISOString(),
          otherId: otherId,
        }
      } else if (otherId && !byConv[c.id].otherId) {
        byConv[c.id].otherId = otherId
      }
    }

    // 4) Resolve usernames
    const otherIds = Array.from(
      new Set(
        Object.values(byConv)
          .map((v) => v.otherId)
          .filter(Boolean) as string[]
      )
    )

    let nameMap: Record<string, string> = {}
    if (otherIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', otherIds)
      ;(profiles || []).forEach((p) => {
        nameMap[p.id] = p.username || 'Unknown'
      })
    }

    // 5) For conversations still missing otherId, read conversation row
    for (const cid of Object.keys(byConv)) {
      if (byConv[cid].otherId) continue
      const { data: c } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', cid)
        .maybeSingle()
      const otherId = pickOtherId(c, userId)
      if (otherId) {
        byConv[cid].otherId = otherId
        if (!nameMap[otherId]) {
          const { data: p } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', otherId)
            .maybeSingle()
          nameMap[otherId] = p?.username || 'Unknown'
        }
      }
    }

    const list: ActiveChat[] = Object.entries(byConv)
      .map(([conversationId, v]) => ({
        conversationId,
        otherId: v.otherId || '',
        otherUsername: v.otherId
          ? nameMap[v.otherId] || 'Unknown'
          : 'Unknown',
        lastAt: v.lastAt,
      }))
      .filter((c) => c.otherUsername && c.otherUsername !== 'Unknown')
      .sort(
        (a, b) =>
          new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
      )

    // If we filtered everyone as Unknown, still show with id so user sees something
    if (list.length === 0) {
      const fallback: ActiveChat[] = Object.entries(byConv)
        .map(([conversationId, v]) => ({
          conversationId,
          otherId: v.otherId || '',
          otherUsername: v.otherId
            ? nameMap[v.otherId] || 'User'
            : 'Chat',
          lastAt: v.lastAt,
        }))
        .sort(
          (a, b) =>
            new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
        )
      setChats(fallback)
      if (fallback.length === 0 && !sentErr) {
        setDebug(
          'No active conversations found from messages. Open a chat and send a message, then return here.'
        )
      }
      return
    }

    setChats(list)
    setDebug('')
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

  const endChat = async (conversationId: string) => {
    setEnding(conversationId)
    const now = new Date().toISOString()

    await supabase
      .from('conversations')
      .update({ expires_at: now })
      .eq('id', conversationId)

    // Best-effort extra flags if columns exist (ignore errors)
    await supabase
      .from('conversations')
      .update({ died_at: now })
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
          Chats that have not vanished yet. Tap a name to open.
        </p>

        {debug && (
          <p className="text-xs text-amber-400 mb-4 break-words">{debug}</p>
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
                  onClick={() => {
                    if (c.otherUsername && c.otherUsername !== 'Chat') {
                      router.push(`/chat/${c.otherUsername}`)
                    }
                  }}
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