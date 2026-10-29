'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

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

const GROUP_EMOJIS = [
  '🎭', '👻', '🦊', '🐼', '🐺', '🐯', '🦁', '🐸', '🐙', '🦄',
  '🐲', '🦇', '🐍', '🦈', '🦉', '🌙', '⭐', '🔥', '⚡', '❄️',
  '🌊', '🧿', '👁️', '🧠', '🎩', '🕶️', '🎱', '🃏', '🔮', '🗝️',
  '💀', '👽', '🤖', '🥷', '😈', '🎃', '🪐', '☄️', '🌀', '✦',
]

function shortTag(username?: string | null) {
  const u = (username || '???').toString()
  return u.slice(-3).toUpperCase()
}

function emojiFromUsername(username?: string | null, fallbackId?: string) {
  const s = (username || fallbackId || '?').toString()
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return GROUP_EMOJIS[h % GROUP_EMOJIS.length]
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
  const [profilesById, setProfilesById] = useState<Record<string, any>>({})
  const [memberReports, setMemberReports] = useState<any[]>([])
  const [showMembers, setShowMembers] = useState(false)
  const [leaveModal, setLeaveModal] = useState(false)
  const [modal, setModal] = useState<'report-group' | 'report-msg' | null>(null)
  const [reportType, setReportType] = useState('')
  const [reportReason, setReportReason] = useState('')
  const [reportMessageId, setReportMessageId] = useState<string | null>(null)
  const [reportTo, setReportTo] = useState<'platform' | 'admin'>('platform')
  const [msgMenuId, setMsgMenuId] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editText, setEditText] = useState('')
  const [maxMembersEdit, setMaxMembersEdit] = useState(12)

  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const mediaRef = useRef<HTMLInputElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  const isAdmin = !!(user && group && user.id === group.admin_id)
  const adminReportCount = memberReports.length

  const grow = () => {
    const el = textRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadMemberReports = async () => {
    if (!groupId) return
    const { data } = await supabase
      .from('reports')
      .select('*')
      .or(
        `conversation_id.eq.${groupId},reason.ilike.%${groupId}%,reason.ilike.%GROUP_ADMIN%`
      )
      .order('created_at', { ascending: false })
      .limit(40)
    const list = (data || []).filter((r: any) => {
      const reason = String(r.reason || '')
      return (
        r.conversation_id === groupId ||
        reason.includes(groupId) ||
        reason.includes('GROUP_ADMIN') ||
        reason.includes('[GROUP]')
      )
    })
    setMemberReports(list)
  }

  const loadMembers = async (token: string) => {
    const res = await fetch(`/api/groups/members?group_id=${groupId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => ({}))
    if (data.members) {
      setMembers(data.members)
      const map: Record<string, any> = {}
      data.members.forEach((m: any) => {
        map[m.user_id] = {
          id: m.user_id,
          username: m.username,
          avatar_icon: m.avatar_icon,
        }
      })
      setProfilesById((prev) => ({ ...prev, ...map }))
    }
  }

  const refreshSenderProfiles = async (msgs: any[]) => {
    const ids = Array.from(
      new Set(msgs.map((m) => m.sender_id).filter(Boolean))
    )
    if (!ids.length) return
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, username, avatar_icon')
      .in('id', ids)
    const map: Record<string, any> = {}
    ;(profs || []).forEach((p) => {
      map[p.id] = p
    })
    setProfilesById((prev) => ({ ...prev, ...map }))
  }

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

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()
      setMyProfile(profile)

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
      setMaxMembersEdit(Math.min(12, g.max_members || 12))

      const { data: msgs } = await supabase
        .from('vanish_group_messages')
        .select('*')
        .eq('group_id', groupId)
        .or('deleted.is.null,deleted.eq.false')
        .order('created_at', { ascending: true })
        .limit(200)

      const list = msgs || []
      setMessages(list)
      await refreshSenderProfiles(list)
      setLoading(false)

      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session) {
        await loadMembers(session.access_token)
      }

      if (g.admin_id === user.id) {
        await loadMemberReports()
      }

      channel = supabase
        .channel(`group-${groupId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'vanish_group_messages',
            filter: `group_id=eq.${groupId}`,
          },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              const row: any = payload.new
              if (row.deleted) return
              setMessages((prev) => {
                if (prev.some((m) => m.id === row.id)) return prev
                return [...prev, row]
              })
              refreshSenderProfiles([row])
            }
            if (payload.eventType === 'UPDATE') {
              const row: any = payload.new
              setMessages((prev) =>
                prev
                  .map((m) => (m.id === row.id ? row : m))
                  .filter((m) => !m.deleted)
              )
            }
            if (payload.eventType === 'DELETE') {
              const row: any = payload.old
              setMessages((prev) => prev.filter((m) => m.id !== row.id))
            }
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
            const row: any = payload.new
            if (row?.died_at) {
              setError('This group has vanished')
              setGroup(row)
            } else if (row) {
              setGroup(row)
            }
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

  const sendText = async () => {
    if (!text.trim() || !user || sending) return
    setSending(true)
    const body = text.trim()
    setText('')
    if (textRef.current) textRef.current.style.height = 'auto'

    const { error: insErr } = await supabase.from('vanish_group_messages').insert({
      group_id: groupId,
      sender_id: user.id,
      body,
      type: 'text',
    })
    if (insErr) setError(insErr.message)
    setSending(false)
  }

  const uploadMedia = async (file: File, kind: 'image' | 'video' | 'file') => {
    if (!user || !group) return
    setUploading(true)
    setError('')
    const path = `${groupId}/${user.id}/${Date.now()}-${file.name.replace(
      /[^a-zA-Z0-9._-]/g,
      '_'
    )}`
    const { error: upErr } = await supabase.storage
      .from('chat-photos')
      .upload(path, file, { upsert: false })
    if (upErr) {
      setError(upErr.message)
      setUploading(false)
      return
    }
    const { data: pub } = supabase.storage.from('chat-photos').getPublicUrl(path)
    const { error: insErr } = await supabase.from('vanish_group_messages').insert({
      group_id: groupId,
      sender_id: user.id,
      body: kind === 'file' ? file.name : '',
      type: kind,
      media_url: pub?.publicUrl || '',
      media_path: path,
    })
    if (insErr) setError(insErr.message)
    setUploading(false)
  }

  const onMediaPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.type.startsWith('video/')) await uploadMedia(file, 'video')
    else await uploadMedia(file, 'image')
  }

  const onFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await uploadMedia(file, 'file')
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
      setInfo('Link ready — copy it')
    }
  }

  const copyLink = async () => {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      setInfo('Link copied')
    } catch {
      setError('Could not copy')
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
    router.replace('/home')
  }

  const leaveAsMember = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session || !user) return

    const res = await fetch('/api/groups/members', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ group_id: groupId, member_id: user.id }),
    })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      await supabase
        .from('vanish_group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', user.id)
    } else if (data.error) {
      setError(data.error)
      return
    }
    router.replace('/home')
  }

  const confirmLeave = async () => {
    setLeaveModal(false)
    if (isAdmin) await endGroup()
    else await leaveAsMember()
  }

  const saveSettings = async (duration_minutes?: number) => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return
    let max = Math.floor(Number(maxMembersEdit) || 12)
    if (max < 2) max = 2
    if (max > 12) max = 12
    const res = await fetch('/api/groups/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        group_id: groupId,
        duration_minutes,
        max_members: max,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (data.error) {
      setError(data.error)
      return
    }
    if (data.group) setGroup(data.group)
    setInfo('Group settings updated')
  }

  const removeMember = async (member_id: string) => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch('/api/groups/members', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ group_id: groupId, member_id }),
    })
    const data = await res.json().catch(() => ({}))
    if (data.error) {
      setError(data.error)
      return
    }
    setMembers((prev) => prev.filter((m) => m.user_id !== member_id))
    setInfo('Member removed')
  }

  const saveEdit = async () => {
    if (!msgMenuId || !user || !editText.trim()) return
    const msg = messages.find((m) => m.id === msgMenuId)
    if (!msg || msg.sender_id !== user.id) return

    const { error: upErr } = await supabase
      .from('vanish_group_messages')
      .update({
        body: editText.trim(),
        edited_at: new Date().toISOString(),
      })
      .eq('id', msgMenuId)
      .eq('sender_id', user.id)

    if (upErr) setError(upErr.message)
    setEditOpen(false)
    setMsgMenuId(null)
    setEditText('')
  }

  const openMsgActions = (m: any) => {
    setMsgMenuId(m.id)
    setEditOpen(false)
    setEditText(m.body || '')
  }

  const submitReport = async () => {
    if (!reportType.trim() || !reportReason.trim()) {
      setError('Choose a type and explain')
      return
    }
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return

    const toLabel = reportTo === 'admin' ? 'GROUP_ADMIN' : 'PLATFORM'
    const msg = reportMessageId
      ? messages.find((m) => m.id === reportMessageId)
      : null
    const msgSnippet = msg?.body
      ? String(msg.body).slice(0, 120)
      : reportMessageId
        ? `[media:${msg?.type || 'file'}]`
        : ''

    if (modal === 'report-msg' && reportMessageId) {
      if (reportTo === 'platform') {
        await fetch('/api/report', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            reported_id: msg?.sender_id || group?.admin_id,
            conversation_id: groupId,
            reason: `[GROUP] [PLATFORM] ${reportType}: ${reportReason} | msg:${msgSnippet}`,
          }),
        })
      }

      const res = await fetch('/api/groups/report-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          group_id: groupId,
          message_id: reportMessageId,
          report_type: reportType,
          reason: `[to:${toLabel}] ${reportReason} | msg:${msgSnippet}`,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (data.error) {
        setError(data.error)
        return
      }
      if (data.removed) {
        setMessages((prev) => prev.filter((m) => m.id !== reportMessageId))
        setInfo('Critical content removed')
      } else {
        setInfo(
          reportTo === 'admin'
            ? 'Report sent to group admin'
            : 'Report sent to platform'
        )
      }
      if (isAdmin) await loadMemberReports()
    } else {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          reported_id: group?.admin_id,
          conversation_id: groupId,
          reason: `[GROUP] [to:${toLabel}] ${reportType}: ${reportReason}`,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (data.error) {
        setError(data.error)
        return
      }
      setInfo('Report sent')
      if (isAdmin) await loadMemberReports()
    }
    setModal(null)
    setReportType('')
    setReportReason('')
    setReportMessageId(null)
    setMsgMenuId(null)
  }

  const displayEmoji = (userId: string, username?: string | null) => {
    return emojiFromUsername(username, userId)
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
          onClick={() => router.push('/home')}
          className="inline-flex items-center gap-2 text-sm font-medium text-cyan-400 border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 px-4 py-2.5 rounded-full transition"
        >
          ← Back to Home
        </button>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen text-white flex flex-col h-screen"
      style={{
        background: `
          radial-gradient(ellipse 120% 80% at 50% -20%, rgba(34,211,238,0.18) 0%, transparent 50%),
          radial-gradient(ellipse 80% 50% at 100% 50%, rgba(8,47,73,0.35) 0%, transparent 45%),
          radial-gradient(ellipse 60% 40% at 0% 80%, rgba(34,211,238,0.08) 0%, transparent 40%),
          linear-gradient(180deg, #05080c 0%, #000000 100%)
        `,
      }}
    >
      <div className="shrink-0 border-b border-cyan-500/15 bg-black/50 backdrop-blur-md p-3 space-y-2">
        <button
          type="button"
          onClick={() => setLeaveModal(true)}
          className="inline-flex items-center gap-2 text-sm font-medium text-cyan-400 border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 px-4 py-2.5 rounded-full transition"
        >
          ← Back to Home
        </button>

        <div className="min-w-0">
          <p className="text-cyan-400 font-semibold text-lg truncate">
            Vanishing group
          </p>
          <p className="text-[11px] text-zinc-500">
            Temporary · Media view-only · Max {group?.max_members ?? 12} members
          </p>
          <p className="text-[11px] text-zinc-500">
            No last seen. No read receipts. Text encrypted.
          </p>
        </div>

        {isAdmin && (
          <div className="rounded-xl border border-cyan-800/50 bg-zinc-950/80 p-2 space-y-2">
            <p className="text-[11px] text-cyan-300/90">
              Ends:{' '}
              {group?.expires_at
                ? new Date(group.expires_at).toLocaleString()
                : '—'}{' '}
              · Max members: {group?.max_members ?? '—'}
            </p>
            <div className="flex flex-wrap gap-1.5 items-center">
              {DURATION_OPTIONS.map((o) => (
                <button
                  key={o.minutes}
                  type="button"
                  onClick={() => saveSettings(o.minutes)}
                  className={`text-[11px] px-2 py-1 rounded-lg border ${
                    Number(group?.duration_minutes) === o.minutes
                      ? 'bg-cyan-500 text-black border-cyan-400'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
              <input
                type="number"
                min={2}
                max={12}
                value={maxMembersEdit}
                onChange={(e) => setMaxMembersEdit(Number(e.target.value) || 2)}
                className="w-16 text-[11px] p-1 rounded-lg bg-zinc-900 border border-zinc-700"
              />
              <button
                type="button"
                onClick={() => saveSettings()}
                className="text-[11px] px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-600"
              >
                Save max
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={createInvite}
                className="text-xs font-medium bg-cyan-600 hover:bg-cyan-500 px-3 py-2 rounded-xl"
              >
                Vanish link
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowMembers(true)
                  loadMemberReports()
                }}
                className="relative text-xs font-medium bg-zinc-800 border border-zinc-600 px-3 py-2 rounded-xl"
              >
                Members
                {adminReportCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-[10px] font-bold flex items-center justify-center">
                    {adminReportCount > 9 ? '9+' : adminReportCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setLeaveModal(true)}
                className="text-xs font-medium bg-red-700 hover:bg-red-600 px-3 py-2 rounded-xl"
              >
                End group
              </button>
            </div>
            {inviteLink && (
              <div className="flex gap-2 items-start">
                <p className="flex-1 text-xs text-cyan-300 break-all bg-black/50 p-2 rounded-lg">
                  {inviteLink}
                </p>
                <button
                  type="button"
                  onClick={copyLink}
                  className="shrink-0 text-xs font-semibold bg-cyan-500 text-black px-3 py-2 rounded-xl"
                >
                  Copy
                </button>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setModal('report-group')
            setReportMessageId(null)
            setReportTo('platform')
          }}
          className="text-xs font-medium bg-yellow-700 hover:bg-yellow-600 px-3 py-2 rounded-xl"
        >
          Report group
        </button>
        {info && <p className="text-xs text-cyan-400">{info}</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <p className="text-center text-zinc-500 text-sm py-16">
            No messages yet. This group will vanish.
          </p>
        ) : (
          messages.map((m) => {
            if (m.deleted) return null
            const mine = m.sender_id === user?.id
            const p = profilesById[m.sender_id]
            const uname = mine
              ? myProfile?.username || p?.username
              : p?.username
            const icon = displayEmoji(m.sender_id, uname)
            const tag = shortTag(uname)

            return (
              <div
                key={m.id}
                className={`flex gap-2 ${mine ? 'justify-end' : 'justify-start'}`}
              >
                {!mine && (
                  <div className="text-xl shrink-0 mt-6" title={uname || ''}>
                    {icon}
                  </div>
                )}
                <div className="max-w-[85%] flex flex-col">
                  <p className="text-sm font-semibold text-zinc-200 mb-1 px-1">
                    <span className="mr-1">{icon}</span>
                    <span className="text-cyan-300/90">{tag}</span>
                    {mine ? (
                      <span className="text-zinc-500 font-normal"> · you</span>
                    ) : null}
                  </p>
                  <button
                    type="button"
                    onClick={() => openMsgActions(m)}
                    className={`text-left px-3.5 py-2.5 rounded-2xl text-[15px] ${
                      mine
                        ? 'bg-cyan-600 text-white rounded-br-md shadow-[0_0_24px_rgba(34,211,238,0.25)]'
                        : 'bg-black/70 text-zinc-100 rounded-bl-md border border-cyan-500/25'
                    }`}
                  >
                    {m.type === 'image' && m.media_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.media_url}
                        alt=""
                        className="max-w-[220px] max-h-[280px] rounded-xl object-cover"
                        draggable={false}
                        onContextMenu={(e) => e.preventDefault()}
                      />
                    )}
                    {m.type === 'video' && m.media_url && (
                      <video
                        src={m.media_url}
                        controls
                        controlsList="nodownload noplaybackrate"
                        disablePictureInPicture
                        className="max-w-[220px] max-h-[280px] rounded-xl"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    {m.type === 'file' && (
                      <p className="text-sm">
                        File (session view): {m.body || 'attachment'}
                      </p>
                    )}
                    {(!m.type || m.type === 'text') && (
                      <p className="whitespace-pre-wrap break-words leading-relaxed">
                        {m.body}
                      </p>
                    )}
                    <p
                      className={`text-[10px] mt-1 ${
                        mine ? 'text-cyan-100/70 text-right' : 'text-zinc-500'
                      }`}
                    >
                      {m.created_at
                        ? new Date(m.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : ''}
                      {m.edited_at ? ' · edited' : ''}
                    </p>
                  </button>
                </div>
                {mine && (
                  <div className="text-xl shrink-0 mt-6" title={uname || ''}>
                    {icon}
                  </div>
                )}
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-cyan-500/15 bg-black/70 backdrop-blur p-3">
        <div className="flex gap-2 items-end">
          <input
            ref={mediaRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={onMediaPick}
          />
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={onFilePick}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => mediaRef.current?.click()}
            className="shrink-0 w-11 h-11 rounded-xl bg-zinc-900 border border-zinc-600 flex items-center justify-center text-lg"
          >
            📷
          </button>
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="shrink-0 w-11 h-11 rounded-xl bg-zinc-900 border border-zinc-600 flex items-center justify-center text-lg"
          >
            📎
          </button>
          <textarea
            ref={textRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              requestAnimationFrame(grow)
            }}
            placeholder="Message…"
            rows={1}
            className="flex-1 min-w-0 p-3 rounded-xl bg-zinc-900 border border-zinc-700 text-[15px] resize-none overflow-hidden focus:outline-none focus:border-cyan-400"
            style={{ maxHeight: 160 }}
          />
          <button
            type="button"
            onClick={sendText}
            disabled={sending || uploading}
            className="shrink-0 bg-cyan-500 text-black font-medium px-4 h-11 rounded-xl disabled:opacity-50"
          >
            Send
          </button>
        </div>
        <p className="text-[10px] text-zinc-600 mt-1 px-1">
          Enter = new line · Tap a message to report / edit · Send button sends
        </p>
      </div>

      {leaveModal && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-zinc-950 border border-zinc-700 rounded-2xl p-5">
            <h3 className="text-lg font-semibold mb-2">
              {isAdmin ? 'End group and leave?' : 'Leave this group?'}
            </h3>
            <p className="text-sm text-zinc-400 mb-4">
              {isAdmin
                ? 'You are admin. Leaving ends the group for everyone and invite links stop working.'
                : 'You will exit the group. Others can continue until the group ends.'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setLeaveModal(false)}
                className="flex-1 bg-zinc-800 py-2.5 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmLeave}
                className="flex-1 bg-red-600 py-2.5 rounded-xl font-medium"
              >
                {isAdmin ? 'End & leave' : 'Leave'}
              </button>
            </div>
          </div>
        </div>
      )}

      {msgMenuId && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl p-4">
            {messages.find((m) => m.id === msgMenuId)?.sender_id ===
              user?.id && (
              <>
                {!editOpen ? (
                  <button
                    type="button"
                    className="w-full text-left py-3 border-b border-zinc-800"
                    onClick={() => setEditOpen(true)}
                  >
                    Edit message
                  </button>
                ) : (
                  <div className="py-2 border-b border-zinc-800">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={3}
                      className="w-full p-2 mb-2 rounded-xl bg-zinc-950 border border-zinc-700 text-sm"
                    />
                    <button
                      type="button"
                      onClick={saveEdit}
                      className="w-full bg-cyan-500 text-black font-medium py-2 rounded-xl mb-1"
                    >
                      Save
                    </button>
                  </div>
                )}
              </>
            )}
            <button
              type="button"
              className="w-full text-left py-3 border-b border-zinc-800 text-yellow-400"
              onClick={() => {
                setReportMessageId(msgMenuId)
                setModal('report-msg')
                setMsgMenuId(null)
                setEditOpen(false)
              }}
            >
              Report this message
            </button>
            <button
              type="button"
              className="w-full text-left py-3 text-zinc-400"
              onClick={() => {
                setMsgMenuId(null)
                setEditOpen(false)
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showMembers && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl p-5 max-h-[75vh] overflow-y-auto">
            <div className="flex justify-between mb-4">
              <p className="font-semibold text-base">Members</p>
              <button
                type="button"
                onClick={() => setShowMembers(false)}
                className="text-sm text-zinc-400 hover:text-white transition"
              >
                Close
              </button>
            </div>

            {adminReportCount > 0 && (
              <div className="mb-4 space-y-2">
                <p className="text-sm font-semibold text-red-400">
                  Reports ({adminReportCount})
                </p>
                {memberReports.map((r) => {
                  const reason = String(r.reason || '')
                  const typeMatch = reason.match(
                    /(Spam|Harassment|Threats|Scam \/ fraud|Sexual content|Hate \/ abuse|Other)/i
                  )
                  const typeLabel = typeMatch ? typeMatch[1] : 'Report'
                  const msgPart = reason.includes('msg:')
                    ? reason.split('msg:').slice(1).join('msg:').trim()
                    : reason
                  const who =
                    profilesById[r.reported_id]?.username ||
                    String(r.reported_id || '').slice(0, 8)
                  return (
                    <div
                      key={r.id}
                      className="rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-sm"
                    >
                      <p className="font-semibold text-red-300">{typeLabel}</p>
                      <p className="text-zinc-300 mt-1 break-words">{msgPart}</p>
                      <p className="text-[11px] text-zinc-500 mt-1">
                        About: {who}
                        {r.created_at
                          ? ` · ${new Date(r.created_at).toLocaleString()}`
                          : ''}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="space-y-2">
              {members.map((m) => (
                <div
                  key={m.user_id}
                  className="flex items-center justify-between py-2 border-b border-zinc-800"
                >
                  <span className="text-base font-semibold">
                    {displayEmoji(m.user_id, m.username)}{' '}
                    <span className="text-cyan-300">{m.username}</span>
                    {m.is_admin ? (
                      <span className="text-zinc-500 font-normal text-sm">
                        {' '}
                        · Admin
                      </span>
                    ) : null}
                  </span>
                  {!m.is_admin && (
                    <button
                      type="button"
                      onClick={() => removeMember(m.user_id)}
                      className="text-xs text-red-400"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-2xl p-5">
            <h3 className="text-lg font-semibold mb-3">
              {modal === 'report-group' ? 'Report group' : 'Report message'}
            </h3>
            {modal === 'report-msg' && (
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setReportTo('platform')}
                  className={`flex-1 py-2 rounded-xl text-sm ${
                    reportTo === 'platform' ? 'bg-yellow-600' : 'bg-zinc-800'
                  }`}
                >
                  Platform
                </button>
                <button
                  type="button"
                  onClick={() => setReportTo('admin')}
                  className={`flex-1 py-2 rounded-xl text-sm ${
                    reportTo === 'admin' ? 'bg-yellow-600' : 'bg-zinc-800'
                  }`}
                >
                  Group admin
                </button>
              </div>
            )}
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