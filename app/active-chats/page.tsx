'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function isUsernameActive(profile: {
  username?: string | null
  username_claimed_at?: string | null
  is_permanent_username?: boolean | null
}) {
  if (!profile?.username) return false
  if (profile.is_permanent_username) return true
  if (!profile.username_claimed_at) return false
  const hoursPassed =
    (Date.now() - new Date(profile.username_claimed_at).getTime()) /
    (1000 * 60 * 60)
  return hoursPassed < 24
}

type ActiveChat = {
  conversationId: string
  otherUsername: string
  otherIcon: string
  lastAt: string
  liveCount: number
}

export default function ActiveChatsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [myUsername, setMyUsername] = useState('')
  const [chats, setChats] = useState<ActiveChat[]>([])
  const [ending, setEnding] = useState<string | null>(null)
  const [hint, setHint] = useState('')

  const load = async () => {
    setHint('')
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      router.push('/auth')
      return
    }
    setUserId(user.id)

    const { data: myProfile } = await supabase
      .from('profiles')
      .select('username, username_claimed_at, is_permanent_username, status')
      .eq('id', user.id)
      .maybeSingle()

    if (myProfile?.status === 'banned') {
      await supabase.auth.signOut()
      router.push('/auth')
      return
    }
    if (myProfile?.status === 'suspended') {
      router.push('/appeal')
      return
    }
    if (!isUsernameActive(myProfile || {})) {
      router.push('/username')
      return
    }
    setMyUsername(myProfile!.username)

    const nowIso = new Date().toISOString()

    // Live messages only (no conversations table)
    const { data: msgs, error } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, created_at, deleted, expires_at')
      .eq('deleted', false)
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: false })
      .limit(400)

    if (error) {
      setHint(error.message)
      setChats([])
      setLoading(false)
      return
    }

    type Acc = {
      conversationId: string
      senders: Set<string>
      lastAt: string
      liveCount: number
    }
    const map = new Map<string, Acc>()

    for (const m of msgs || []) {
      if (!m.conversation_id) continue
      if (m.deleted === true) continue
      if (m.expires_at && new Date(m.expires_at).getTime() <= Date.now()) continue

      const existing = map.get(m.conversation_id)
      if (!existing) {
        map.set(m.conversation_id, {
          conversationId: m.conversation_id,
          senders: new Set([m.sender_id]),
          lastAt: m.created_at,
          liveCount: 1,
        })
      } else {
        existing.senders.add(m.sender_id)
        existing.liveCount += 1
        if (new Date(m.created_at).getTime() > new Date(existing.lastAt).getTime()) {
          existing.lastAt = m.created_at
        }
      }
    }

    // Keep only threads where I sent at least one live message
    // OR the conversation_id includes my current username (sorted pair)
    const myName = (myProfile!.username || '').toLowerCase()
    const mine = Array.from(map.values()).filter((c) => {
      if (c.senders.has(user.id)) return true
      const parts = c.conversationId.toLowerCase().split('_')
      return parts.includes(myName)
    })

    if (mine.length === 0) {
      setChats([])
      setLoading(false)
      return
    }

    const otherIds = new Set<string>()
    for (const c of mine) {
      for (const sid of c.senders) {
        if (sid !== user.id) otherIds.add(sid)
      }
    }

    // Resolve other party: from senders, or by username in conversation_id
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, avatar_icon, username_claimed_at, is_permanent_username')
      .in('id', Array.from(otherIds).length ? Array.from(otherIds) : ['00000000-0000-0000-0000-000000000000'])

    const byId = new Map((profiles || []).map((p) => [p.id, p]))

    // Also load any username that appears in conversation_id but never sent yet
    const needNames = new Set<string>()
    for (const c of mine) {
      const parts = c.conversationId.split('_')
      for (const p of parts) {
        if (p && p.toLowerCase() !== myName) needNames.add(p)
      }
    }
    let byName = new Map<string, any>()
    if (needNames.size > 0) {
      const { data: byUser } = await supabase
        .from('profiles')
        .select('id, username, avatar_icon, username_claimed_at, is_permanent_username')
        .in('username', Array.from(needNames))
      byName = new Map(
        (byUser || []).map((p) => [String(p.username).toLowerCase(), p])
      )
    }

    const list: ActiveChat[] = []
    for (const c of mine) {
      if (c.liveCount < 1) continue

      let other: any = null
      for (const sid of c.senders) {
        if (sid !== user.id && byId.has(sid)) {
          other = byId.get(sid)
          break
        }
      }
      if (!other) {
        const parts = c.conversationId.toLowerCase().split('_')
        for (const p of parts) {
          if (p !== myName && byName.has(p)) {
            other = byName.get(p)
            break
          }
        }
      }

      if (!other?.username || !isUsernameActive(other)) continue

      list.push({
        conversationId: c.conversationId,
        otherUsername: other.username,
        otherIcon: other.avatar_icon || '🎭',
        lastAt: c.lastAt,
        liveCount: c.liveCount,
      })
    }

    list.sort(
      (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
    )
    setChats(list)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const endChat = async (conversationId: string) => {
    if (!userId || ending) return
    setEnding(conversationId)
    const nowIso = new Date().toISOString()
    await supabase
      .from('messages')
      .update({ deleted: true, expires_at: nowIso })
      .eq('conversation_id', conversationId)
      .eq('deleted', false)
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
          type="button"
          onClick={() => router.push('/home')}
          className="inline-flex items-center gap-2 text-sm font-medium text-cyan-400 border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 px-4 py-2.5 rounded-full mb-8 transition"
        >
          ← Back to Home
        </button>

        <h1 className="text-2xl font-bold mb-1">Active chats</h1>
        <p className="text-sm text-zinc-500 mb-6">
          Live chats only. Tap a name to open. End removes it for both when
          messages are marked gone.
        </p>

        {hint && (
          <p className="text-sm text-red-400 mb-4 break-words">{hint}</p>
        )}

        {chats.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-center">
            <p className="text-zinc-500 text-sm">No active chat</p>
            <button
              type="button"
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
                    {c.otherIcon} {c.otherUsername}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {new Date(c.lastAt).toLocaleString()} · {c.liveCount} live
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