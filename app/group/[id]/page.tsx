'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { emojiFromUsername } from '@/lib/groupEmojis'

const REPORT_TYPES = [
  'Spam',
  'Harassment',
  'Threats',
  'Scam / fraud',
  'Sexual content',
  'Hate / abuse',
  'Other',
]

const DURATION_OPTIONS = [
  { minutes: 30, label: '30m' },
  { minutes: 60, label: '1h' },
  { minutes: 180, label: '3h' },
  { minutes: 1440, label: '24h' },
]

function shortTag(username?: string | null, fallbackId?: string) {
  const s = (username || fallbackId || '???').toString()
  return s.slice(-3).toUpperCase()
}

function isProfileUsernameActive(profile: {
  username?: string | null
  username_claimed_at?: string | null
  is_permanent_username?: boolean | null
}) {
  if (!profile?.username) return false
  if (profile.is_permanent_username) return true
  if (!profile.username_claimed_at) return false
  const hours =
    (Date.now() - new Date(profile.username_claimed_at).getTime()) /
    (1000 * 60 * 60)
  return hours < 24
}

export default function GroupRoomPage() {
  const params = useParams()
  const groupId = params.id as string
  const router = useRouter()

  const [user, setUser] = useState<any>(null)
  const [myProfile, setMyProfile] = useState<any>(null)
  const [group, setGroup] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [members, setMembers] = useState<any[]>([])
  const [profilesMap, setProfilesMap] = useState<Record<string, any>>({})
  const [showMembers, setShowMembers] = useState(false)
  const [vanished, setVanished] = useState(false)
  const [vanishedMsg, setVanishedMsg] = useState('This group has vanished.')
  const [modal, setModal] = useState<
    'report-group' | 'report-msg' | 'leave' | 'edit' | null
  >(null)
  const [reportType, setReportType] = useState('')
  const [reportReason, setReportReason] = useState('')
  const [reportMessageId, setReportMessageId] = useState<string | null>(null)
  const [reportScope, setReportScope] = useState<'platform' | 'admin'>('platform')
  const [editText, setEditText] = useState('')
  const [editMsgId, setEditMsgId] = useState<string | null>(null)
  const [adminReports, setAdminReports] = useState<any[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const isAdmin = !!(user && group && group.admin_id === user.id)

  const markVanished = (msg?: string) => {
    setVanished(true)
    setVanishedMsg(msg || 'This group has vanished.')
    setMessages([])
  }

  const forceLanding = async () => {
    try {
      await supabase.auth.signOut()
    } catch {
      /* ignore */
    }
    router.replace('/')
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    let mounted = true

    const loadMembers = async () => {
      const { data: mems } = await supabase
        .from('vanish_group_members')
        .select('user_id')
        .eq('group_id', groupId)

      const list = mems || []
      setMembers(list)

      const ids = list.map((m: any) => m.user_id).filter(Boolean)
      if (ids.length === 0) return

      const { data: profs } = await supabase
        .from('profiles')
        .select('id, username, avatar_icon, username_claimed_at, is_permanent_username')
        .in('id', ids)

      const map: Record<string, any> = {}
      ;(profs || []).forEach((p: any) => {
        map[p.id] = p
      })
      setProfilesMap(map)
    }

    const loadMessages = async () => {
      const { data } = await supabase
        .from('vanish_group_messages')
        .select('*')
        .eq('group_id', groupId)
        .eq('deleted', false)
        .order('created_at', { ascending: true })
      if (mounted) setMessages(data || [])
    }

    const loadAdminReports = async () => {
      const { data } = await supabase
        .from('reports')
        .select('*')
        .eq('conversation_id', groupId)
        .order('created_at', { ascending: false })
        .limit(30)
      if (mounted) setAdminReports(data || [])
    }

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

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      if (!profile || !isProfileUsernameActive(profile)) {
        await forceLanding()
        return
      }
      if (!mounted) return
      setMyProfile(profile)

      const { data: g, error: gErr } = await supabase
        .from('vanish_groups')
        .select('*')
        .eq('id', groupId)
        .maybeSingle()

      if (gErr || !g || g.died_at) {
        markVanished('This group has vanished.')
        setLoading(false)
        return
      }
      if (!mounted) return
      setGroup(g)

      const { data: mem } = await supabase
        .from('vanish_group_members')
        .select('user_id')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (!mem) {
        setError('You are not in this group.')
        setLoading(false)
        return
      }

      await loadMembers()
      await loadMessages()
      if (g.admin_id === user.id) await loadAdminReports()

      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }

      const ch = supabase
        .channel(`group-room-${groupId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'vanish_group_messages',
            filter: `group_id=eq.${groupId}`,
          },
          (payload) => {
            const row = payload.new as any
            if (!row || row.deleted) return
            setMessages((prev) => {
              if (prev.some((m) => m.id === row.id)) return prev
              return [...prev, row]
            })
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'vanish_group_messages',
            filter: `group_id=eq.${groupId}`,
          },
          (payload) => {
            const row = payload.new as any
            if (!row) return
            if (row.deleted) {
              setMessages((prev) => prev.filter((m) => m.id !== row.id))
            } else {
              setMessages((prev) =>
                prev.map((m) => (m.id === row.id ? { ...m, ...row } : m))
              )
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'vanish_group_messages',
            filter: `group_id=eq.${groupId}`,
          },
          (payload) => {
            const row = payload.old as any
            if (!row?.id) return
            setMessages((prev) => prev.filter((m) => m.id !== row.id))
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'vanish_groups',
            filter: `id=eq.${groupId}`,
          },
          (payload) => {
            const row = payload.new as any
            if (row?.died_at) {
              markVanished('This group has vanished.')
            } else if (row) {
              setGroup((prev: any) => ({ ...prev, ...row }))
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'vanish_groups',
            filter: `id=eq.${groupId}`,
          },
          () => {
            markVanished('This group has vanished.')
          }
        )
        .subscribe()

      channelRef.current = ch
      setLoading(false)
    }

    init()

    const expiryTick = setInterval(async () => {
      const {
        data: { user: u },
      } = await supabase.auth.getUser()
      if (!u) {
        router.replace('/')
        return
      }
      const { data: p } = await supabase
        .from('profiles')
        .select(
          'username, username_claimed_at, is_permanent_username, id'
        )
        .eq('id', u.id)
        .maybeSingle()

      if (!p || !isProfileUsernameActive(p)) {
        clearInterval(expiryTick)
        await forceLanding()
        return
      }

      // Admin username expired → kill group for everyone (realtime via died_at)
      if (group?.admin_id) {
        const { data: adminProf } = await supabase
          .from('profiles')
          .select(
            'username, username_claimed_at, is_permanent_username'
          )
          .eq('id', group.admin_id)
          .maybeSingle()

        if (!adminProf || !isProfileUsernameActive(adminProf)) {
          const {
            data: { session },
          } = await supabase.auth.getSession()
          await fetch('/api/groups/die', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session?.access_token || ''}`,
            },
            body: JSON.stringify({ group_id: groupId }),
          })
          markVanished('This group has vanished.')
        }
      }
    }, 20000)

    return () => {
      mounted = false
      clearInterval(expiryTick)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [groupId, router])

  const endGroup = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const res = await fetch('/api/groups/die', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({ group_id: groupId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || 'Could not end group')
      return
    }
    markVanished('This group has vanished.')
  }

  const leaveAsMember = async () => {
    if (!user) return
    await supabase.from('vanish_group_exits').upsert(
      {
        group_id: groupId,
        user_id: user.id,
      },
      { onConflict: 'group_id,user_id' }
    )
    await supabase
      .from('vanish_group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', user.id)
    router.replace('/home')
  }

  const confirmLeave = async () => {
    setModal(null)
    if (isAdmin) {
      await endGroup()
    } else {
      await leaveAsMember()
    }
  }

  const createInvite = async () => {
    if (!isAdmin) return
    const code = Math.random().toString(36).slice(2, 10)
    const { error: invErr } = await supabase.from('vanish_group_invites').insert({
      group_id: groupId,
      code,
      created_by: user.id,
    })
    if (invErr) {
      setError(invErr.message)
      return
    }
    const origin =
      typeof window !== 'undefined' ? window.location.origin : ''
    setInviteLink(`${origin}/g/${code}`)
    setInfo('Invite link ready')
  }

  const copyInvite = async () => {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      setInfo('Link copied')
    } catch {
      setInfo(inviteLink)
    }
  }

  const setDuration = async (minutes: number) => {
    if (!isAdmin) return
    const expires = new Date(Date.now() + minutes * 60 * 1000).toISOString()
    const { error: e } = await supabase
      .from('vanish_groups')
      .update({
        duration_minutes: minutes,
        expires_at: expires,
      })
      .eq('id', groupId)
    if (e) setError(e.message)
    else {
      setGroup((g: any) => ({
        ...g,
        duration_minutes: minutes,
        expires_at: expires,
      }))
      setInfo('Group time updated')
    }
  }

  const sendText = async () => {
    if (!user || !text.trim() || sending || vanished) return
    setSending(true)
    const body = text.trim()
    setText('')
    const { error: e } = await supabase.from('vanish_group_messages').insert({
      group_id: groupId,
      sender_id: user.id,
      type: 'text',
      body,
      deleted: false,
    })
    if (e) setError(e.message)
    setSending(false)
  }

  const uploadMedia = async (file: File) => {
    if (!user || vanished) return
    setUploading(true)
    const path = `groups/${groupId}/${Date.now()}-${file.name}`
    const { error: upErr } = await supabase.storage
      .from('chat-photos')
      .upload(path, file)
    if (upErr) {
      setError(upErr.message)
      setUploading(false)
      return
    }
    const { data: pub } = supabase.storage.from('chat-photos').getPublicUrl(path)
    const isVideo = file.type.startsWith('video/')
    const { error: e } = await supabase.from('vanish_group_messages').insert({
      group_id: groupId,
      sender_id: user.id,
      type: isVideo ? 'video' : 'image',
      media_url: pub.publicUrl,
      body: '',
      deleted: false,
    })
    if (e) setError(e.message)
    setUploading(false)
  }

  const softDeleteMessage = async (id: string) => {
    await supabase
      .from('vanish_group_messages')
      .update({ deleted: true })
      .eq('id', id)
      .eq('sender_id', user.id)
  }

  const saveEdit = async () => {
    if (!editMsgId || !editText.trim()) return
    await supabase
      .from('vanish_group_messages')
      .update({
        body: editText.trim(),
        edited_at: new Date().toISOString(),
      })
      .eq('id', editMsgId)
      .eq('sender_id', user.id)
    setModal(null)
    setEditMsgId(null)
    setEditText('')
  }

  const submitReport = async () => {
    if (!user || !reportType || !reportReason.trim()) return
    const {
      data: { session },
    } = await supabase.auth.getSession()
    await fetch('/api/report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({
        reported_id: group?.admin_id,
        conversation_id: groupId,
        reason: `[${reportScope}] ${reportType}: ${reportReason}${
          reportMessageId ? ` msg:${reportMessageId}` : ''
        }`,
      }),
    })
    setModal(null)
    setReportType('')
    setReportReason('')
    setReportMessageId(null)
    setInfo('Report sent')
  }

  const removeMember = async (uid: string) => {
    if (!isAdmin) return
    await supabase
      .from('vanish_group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', uid)
    await supabase.from('vanish_group_exits').upsert(
      { group_id: groupId, user_id: uid },
      { onConflict: 'group_id,user_id' }
    )
    setMembers((prev) => prev.filter((m) => m.user_id !== uid))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-zinc-400">Loading group…</p>
      </div>
    )
  }
    if (vanished) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-zinc-950 border border-cyan-500/30 rounded-3xl p-6 text-center">
          <p className="text-2xl font-semibold text-cyan-400 mb-3">
            {vanishedMsg}
          </p>
          <p className="text-sm text-zinc-400 mb-6">
            Everything in this group is gone.
          </p>
          <button
            type="button"
            onClick={() => router.replace('/home')}
            className="w-full bg-cyan-500 text-black font-medium py-3 rounded-xl"
          >
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  if (error && !group) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            type="button"
            onClick={() => router.replace('/home')}
            className="inline-flex items-center gap-2 text-sm font-medium text-cyan-400 border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 px-4 py-2.5 rounded-full transition"
          >
            ← Back to Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen text-white flex flex-col"
      style={{
        background:
          'radial-gradient(ellipse 100% 70% at 50% 0%, rgba(34,211,238,0.14) 0%, transparent 55%), radial-gradient(ellipse 50% 40% at 90% 90%, rgba(6,78,89,0.25) 0%, transparent 50%), #030712',
      }}
    >
      <div className="border-b border-zinc-800/80 px-3 py-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setModal('leave')}
            className="inline-flex items-center gap-2 text-sm font-medium text-cyan-400 border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 px-4 py-2.5 rounded-full transition"
          >
            ← Back
          </button>
          <div className="text-center min-w-0 flex-1">
            <p className="font-semibold text-cyan-300 truncate">
              {group?.name || 'Group'}
            </p>
            <p className="text-[11px] text-zinc-400">
              Group chat · text encrypted on device where enabled
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowMembers(true)}
            className="relative text-xs bg-zinc-800 border border-zinc-700 px-3 py-2 rounded-xl"
          >
            Members
            {isAdmin && adminReports.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-600 text-[10px] rounded-full flex items-center justify-center px-1">
                {adminReports.length}
              </span>
            )}
          </button>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[11px] text-zinc-500">Time (admin only)</span>
            {DURATION_OPTIONS.map((d) => (
              <button
                key={d.minutes}
                type="button"
                onClick={() => setDuration(d.minutes)}
                className={`text-xs px-2.5 py-1 rounded-lg border ${
                  group?.duration_minutes === d.minutes
                    ? 'bg-cyan-600 border-cyan-500'
                    : 'bg-zinc-900 border-zinc-700'
                }`}
              >
                {d.label}
              </button>
            ))}
            <button
              type="button"
              onClick={createInvite}
              className="text-xs px-2.5 py-1 rounded-lg bg-zinc-800 border border-zinc-600"
            >
              Invite link
            </button>
            {inviteLink && (
              <button
                type="button"
                onClick={copyInvite}
                className="text-xs px-2.5 py-1 rounded-lg bg-cyan-700"
              >
                Copy link
              </button>
            )}
            <button
              type="button"
              onClick={() => setModal('leave')}
              className="text-xs px-2.5 py-1 rounded-lg bg-red-700"
            >
              End group
            </button>
          </div>
        )}
        {info && <p className="text-xs text-cyan-400">{info}</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-zinc-500 text-sm py-16">
            No messages yet.
          </p>
        )}
        {messages.map((msg) => {
          const mine = msg.sender_id === user?.id
          const prof = profilesMap[msg.sender_id]
          const uname = prof?.username || msg.sender_id?.slice(0, 6)
          const emoji = emojiFromUsername(uname, msg.sender_id)
          return (
            <div
              key={msg.id}
              className={`flex gap-2 ${mine ? 'justify-end' : 'justify-start'}`}
            >
              {!mine && (
                <span className="text-xl shrink-0 mt-5" title={uname}>
                  {emoji}
                </span>
              )}
              <div className={`max-w-[78%] ${mine ? 'items-end' : 'items-start'}`}>
                <p
                  className={`text-sm font-semibold mb-1 ${
                    mine ? 'text-right text-cyan-300' : 'text-left text-zinc-300'
                  }`}
                >
                  {emoji} {shortTag(uname, msg.sender_id)}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (mine && msg.type === 'text') {
                      setEditMsgId(msg.id)
                      setEditText(msg.body || '')
                      setModal('edit')
                    } else {
                      setReportMessageId(msg.id)
                      setModal('report-msg')
                    }
                  }}
                  className={`w-full text-left rounded-2xl px-3.5 py-2.5 border ${
                    mine
                      ? 'bg-cyan-600/90 border-cyan-500/50 text-black rounded-br-md'
                      : 'bg-zinc-900/90 border-zinc-700 text-zinc-100 rounded-bl-md'
                  }`}
                >
                  {msg.type === 'image' && msg.media_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={msg.media_url}
                      alt=""
                      className="max-w-[220px] max-h-[280px] rounded-lg object-cover pointer-events-none select-none"
                      draggable={false}
                    />
                  )}
                  {msg.type === 'video' && msg.media_url && (
                    <video
                      src={msg.media_url}
                      controls
                      controlsList="nodownload noplaybackrate"
                      disablePictureInPicture
                      className="max-w-[220px] max-h-[280px] rounded-lg"
                    />
                  )}
                  {msg.type === 'text' && (
                    <p className="text-[15px] whitespace-pre-wrap break-words">
                      {msg.body}
                    </p>
                  )}
                  {msg.edited_at && (
                    <p className="text-[10px] opacity-70 mt-1">edited</p>
                  )}
                </button>
                {mine && (
                  <button
                    type="button"
                    onClick={() => softDeleteMessage(msg.id)}
                    className="text-[10px] text-zinc-500 mt-1"
                  >
                    Vanish message
                  </button>
                )}
              </div>
              {mine && (
                <span className="text-xl shrink-0 mt-5" title={uname}>
                  {emoji}
                </span>
              )}
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-zinc-800 p-3">
        <div className="flex gap-2 items-end">
          <label className="cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-3 py-3 rounded-xl text-lg">
            📎
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) uploadMedia(f)
                e.target.value = ''
              }}
            />
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                // Enter = new line only (do not send)
                return
              }
            }}
            rows={1}
            placeholder="Message…"
            className="flex-1 p-3 rounded-xl bg-zinc-900 border border-zinc-700 text-sm resize-none min-h-[44px] max-h-32"
          />
          <button
            type="button"
            disabled={sending || uploading || !text.trim()}
            onClick={sendText}
            className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-medium px-4 py-3 rounded-xl"
          >
            Send
          </button>
        </div>
      </div>

      {showMembers && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-700 rounded-3xl p-5 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between mb-4">
              <p className="font-semibold text-lg">Members</p>
              <button
                type="button"
                onClick={() => setShowMembers(false)}
                className="text-zinc-400"
              >
                Close
              </button>
            </div>
            {isAdmin && adminReports.length > 0 && (
              <div className="mb-4 space-y-2">
                <p className="text-sm text-red-400 font-medium">Reports</p>
                {adminReports.map((r) => (
                  <div
                    key={r.id}
                    className="text-xs bg-zinc-900 border border-red-900/50 rounded-xl p-3"
                  >
                    <p className="text-red-300">{r.reason}</p>
                    <p className="text-zinc-500 mt-1">
                      {r.created_at
                        ? new Date(r.created_at).toLocaleString()
                        : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-2">
              {members.map((m) => {
                const p = profilesMap[m.user_id]
                const uname = p?.username || m.user_id.slice(0, 8)
                const emoji = emojiFromUsername(uname, m.user_id)
                return (
                  <div
                    key={m.user_id}
                    className="flex items-center justify-between py-2 border-b border-zinc-800"
                  >
                    <span className="text-base font-medium">
                      {emoji} {uname}
                      {m.user_id === group?.admin_id ? ' · admin' : ''}
                    </span>
                    {isAdmin && m.user_id !== user?.id && (
                      <button
                        type="button"
                        onClick={() => removeMember(m.user_id)}
                        className="text-xs text-red-400"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {modal === 'leave' && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-zinc-950 border border-zinc-700 rounded-3xl p-5">
            <h3 className="text-lg font-semibold mb-2">
              {isAdmin ? 'End this group?' : 'Leave this group?'}
            </h3>
            <p className="text-sm text-zinc-400 mb-5">
              {isAdmin
                ? 'The group vanishes for everyone. Links stop working.'
                : 'You leave permanently. This invite will not let you back in.'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="flex-1 bg-zinc-700 py-2.5 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmLeave}
                className="flex-1 bg-red-600 py-2.5 rounded-xl"
              >
                {isAdmin ? 'End group' : 'Leave'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'edit' && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-zinc-950 border border-zinc-700 rounded-3xl p-5">
            <h3 className="text-lg font-semibold mb-3">Edit message</h3>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={3}
              className="w-full p-3 mb-3 rounded-xl bg-zinc-900 border border-zinc-700 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="flex-1 bg-zinc-700 py-2.5 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                className="flex-1 bg-cyan-500 text-black font-medium py-2.5 rounded-xl"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {(modal === 'report-msg' || modal === 'report-group') && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-zinc-950 border border-zinc-700 rounded-3xl p-5">
            <h3 className="text-lg font-semibold mb-3">Report</h3>
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => setReportScope('platform')}
                className={`flex-1 text-xs py-2 rounded-lg border ${
                  reportScope === 'platform'
                    ? 'bg-yellow-600 border-yellow-500'
                    : 'bg-zinc-800 border-zinc-700'
                }`}
              >
                Platform
              </button>
              <button
                type="button"
                onClick={() => setReportScope('admin')}
                className={`flex-1 text-xs py-2 rounded-lg border ${
                  reportScope === 'admin'
                    ? 'bg-yellow-600 border-yellow-500'
                    : 'bg-zinc-800 border-zinc-700'
                }`}
              >
                Group admin
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {REPORT_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setReportType(type)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border ${
                    reportType === type
                      ? 'bg-yellow-600 border-yellow-500'
                      : 'bg-zinc-800 border-zinc-700'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value.slice(0, 400))}
              rows={3}
              placeholder="What happened?"
              className="w-full p-3 mb-2 rounded-xl bg-zinc-800 border border-zinc-700 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setModal(null)
                  setReportType('')
                  setReportReason('')
                  setReportMessageId(null)
                }}
                className="flex-1 bg-zinc-700 py-2.5 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitReport}
                className="flex-1 bg-yellow-600 py-2.5 rounded-xl font-medium"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}