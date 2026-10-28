'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function GroupRoomPage() {
  const params = useParams()
  const groupId = params.id as string
  const router = useRouter()

  const [user, setUser] = useState<any>(null)
  const [group, setGroup] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    let channel: any = null
    let mounted = true

    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/')
        return
      }
      if (!mounted) return
      setUser(user)

      const { data: g, error: gErr } = await supabase
        .from('vanish_groups')
        .select('*')
        .eq('id', groupId)
        .maybeSingle()

      if (gErr || !g) {
        setError('Group not found or already vanished')
        setLoading(false)
        return
      }

      if (
        g.died_at ||
        (g.expires_at && new Date(g.expires_at).getTime() <= Date.now())
      ) {
        setError('This group has vanished')
        setLoading(false)
        return
      }

      setGroup(g)

      const { data: msgs } = await supabase
        .from('vanish_group_messages')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: true })
        .limit(200)

      setMessages(msgs || [])
      setLoading(false)

      channel = supabase
        .channel(`group-${groupId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'vanish_group_messages',
            filter: `group_id=eq.${groupId}`,
          },
          (payload) => {
            setMessages((prev) => {
              if (prev.some((m) => m.id === payload.new.id)) return prev
              return [...prev, payload.new]
            })
          }
        )
        .subscribe()
    }

    init()
    return () => {
      mounted = false
      if (channel) supabase.removeChannel(channel)
    }
  }, [groupId, router])

  const send = async () => {
    if (!text.trim() || !user || sending) return
    setSending(true)
    const body = text.trim()
    setText('')
    const { error: insErr } = await supabase.from('vanish_group_messages').insert({
      group_id: groupId,
      sender_id: user.id,
      body,
      type: 'text',
    })
    if (insErr) setError(insErr.message)
    setSending(false)
  }

  const createInvite = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return

    const res = await fetch('/api/groups/invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ group_id: groupId }),
    })
    const data = await res.json().catch(() => ({}))
    if (data.error) {
      setError(data.error)
      return
    }
    const code = data.code || data.inviteCode
    if (code) {
      const origin =
        typeof window !== 'undefined'
          ? window.location.origin
          : 'https://vanish-pearl.vercel.app'
      setInviteLink(`${origin}/g/${code}`)
    }
  }

  const endGroup = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch('/api/groups/die', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ group_id: groupId }),
    })
    const data = await res.json().catch(() => ({}))
    if (data.error) {
      setError(data.error)
      return
    }
    router.replace('/search')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-zinc-400">Loading group…</p>
      </div>
    )
  }

  if (error && !group) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4 gap-4">
        <p className="text-red-400 text-center">{error}</p>
        <button
          onClick={() => router.push('/search')}
          className="bg-cyan-500 text-black px-5 py-2.5 rounded-xl font-medium"
        >
          Back
        </button>
      </div>
    )
  }

  const isAdmin = user && group && user.id === group.admin_id

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="border-b border-zinc-800 p-4 space-y-2">
        <div className="flex justify-between items-center gap-2">
          <button
            onClick={() => router.push('/search')}
            className="text-sm text-zinc-400 hover:text-white"
          >
            ← Back
          </button>
          <p className="text-cyan-400 font-semibold truncate">Group</p>
          <span className="text-[10px] text-zinc-500">
            {group?.expires_at
              ? `Ends ${new Date(group.expires_at).toLocaleString()}`
              : ''}
          </span>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={createInvite}
              className="text-xs bg-cyan-600 hover:bg-cyan-500 px-3 py-2 rounded-xl"
            >
              Create vanish link
            </button>
            <button
              onClick={endGroup}
              className="text-xs bg-red-700 hover:bg-red-600 px-3 py-2 rounded-xl"
            >
              End group
            </button>
          </div>
        )}
        {inviteLink && (
          <p className="text-xs text-cyan-300 break-all bg-zinc-900 p-2 rounded-lg">
            {inviteLink}
          </p>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 ? (
          <p className="text-center text-zinc-500 text-sm py-16">No messages yet</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${
                m.sender_id === user?.id
                  ? 'ml-auto bg-cyan-900/40 border border-cyan-800'
                  : 'bg-zinc-900 border border-zinc-800'
              }`}
            >
              {m.body}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-zinc-800 p-3 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Message…"
          className="flex-1 p-3 rounded-xl bg-zinc-900 border border-zinc-700 text-sm"
        />
        <button
          onClick={send}
          disabled={sending}
          className="bg-cyan-500 text-black font-medium px-4 rounded-xl disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  )
}