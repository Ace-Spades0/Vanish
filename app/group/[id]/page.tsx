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
  const [info, setInfo] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [members, setMembers] = useState<any[]>([])
  const [showMembers, setShowMembers] = useState(false)
  const [modal, setModal] = useState<'report-group' | 'report-msg' | null>(null)
  const [reportType, setReportType] = useState('')
  const [reportReason, setReportReason] = useState('')
  const [reportMessageId, setReportMessageId] = useState<string | null>(null)
  const [msgMenuId, setMsgMenuId] = useState<string | null>(null)
  const [maxMembersEdit, setMaxMembersEdit] = useState(10)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const mediaRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadMembers = async (token: string) => {
    const res = await fetch(`/api/groups/members?group_id=${groupId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => ({}))
    if (data.members) setMembers(data.members)
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
      setMaxMembersEdit(g.max_members || 20)

      const { data: msgs } = await supabase
        .from('vanish_group_messages')
        .select('*')
        .eq('group_id', groupId)
        .or('deleted.is.null,deleted.eq.false')
        .order('created_at', { ascending: true })
        .limit(200)

      setMessages(msgs || [])
      setLoading(false)

      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session && g.admin_id === user.id) {
        await loadMembers(session.access_token)
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
    const url = pub?.publicUrl || ''

    const row: any = {
      group_id: groupId,
      sender_id: user.id,
      body: kind === 'file' ? file.name : '',
      type: kind,
      media_url: url,
      media_path: path,
    }

    const { error: insErr } = await supabase
      .from('vanish_group_messages')
      .insert(row)

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
    router.replace('/search')
  }

  const saveSettings = async (duration_minutes?: number) => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch('/api/groups/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        group_id: groupId,
        duration_minutes,
        max_members: maxMembersEdit,
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

  const submitReport = async () => {
    if (!reportType.trim() || !reportReason.trim()) {
      setError('Choose a type and explain')
      return
    }
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return

    if (modal === 'report-msg' && reportMessageId) {
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
          reason: reportReason,
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
        setInfo('Report sent')
      }
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
          reason: `[GROUP] ${reportType}: ${reportReason}`,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (data.error) {
        setError(data.error)
        return
      }
      setInfo('Report sent')
    }

    setModal(null)
    setReportType('')
    setReportReason('')
    setReportMessageId(null)
    setMsgMenuId(null)
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
          className="text-sm font-semibold text-black bg-cyan-500 px-4 py-2.5 rounded-xl"
        >
          ← Back
        </button>
      </div>
    )
  }

  const isAdmin = !!(user && group && user.id === group.admin_id)

  return (
    <div
      className="min-h-screen text-white flex flex-col"
      style={{
        background:
          'radial-gradient(ellipse at top, #0c1a1f 0%, #000000 55%), repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34,211,238,0.03) 2px, rgba(34,211,238,0.03) 3px)',
      }}
    >
      <div className="border-b border-cyan-900/40 bg-black/60 backdrop-blur-md p-3 space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/search')}
            className="shrink-0 text-sm font-semibold text-black bg-cyan-500 hover:bg-cyan-400 px-4 py-2.5 rounded-xl"
          >
            ← Back
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-cyan-400 font-semibold text-lg truncate">
              Vanishing group
            </p>
            <p className="text-[11px] text-zinc-500">
              Temporary · Media view-only · No permanent save
            </p>
          </div>
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
                max={100}
                value={maxMembersEdit}
                onChange={(e) => setMaxMembersEdit(Number(e.target.value) || 2)}
                className="w-16 text-[11px] p-1 rounded-lg bg-zinc-900 border border-zinc-700"
                title="Max members"
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
                onClick={createInvite}
                className="text-xs font-medium bg-cyan-600 hover:bg-cyan-500 px-3 py-2 rounded-xl"
              >
                Vanish link
              </button>
              <button
                onClick={() => setShowMembers(true)}
                className="text-xs font-medium bg-zinc-800 border border-zinc-600 px-3 py-2 rounded-xl"
              >
                Members
              </button>
              <button
                onClick={endGroup}
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

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setModal('report-group')
              setReportMessageId(null)
            }}
            className="text-xs font-medium bg-yellow-700 hover:bg-yellow-600 px-3 py-2 rounded-xl"
          >
            Report group
          </button>
        </div>

        {info && <p className="text-xs text-cyan-400">{info}</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <p className="text-center text-zinc-500 text-sm py-16">
            No messages yet. This group will vanish.
          </p>
        ) : (
          messages.map((m) => {
            if (m.deleted) return null
            const mine = m.sender_id === user?.id
            return (
              <div key={m.id} className={`max-w-[85%] ${mine ? 'ml-auto' : ''}`}>
                <div
                  className={`px-3 py-2 rounded-2xl text-[15px] ${
                    mine
                      ? 'bg-cyan-900/35 border border-cyan-800/80'
                      : 'bg-zinc-900/80 border border-zinc-800'
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
                    />
                  )}
                  {m.type === 'file' && (
                    <p className="text-sm text-zinc-300">
                      File (session view): {m.body || 'attachment'}
                    </p>
                  )}
                  {(!m.type || m.type === 'text') && (
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  )}
                  <p className="text-[10px] text-zinc-500 mt-1">
                    {m.created_at
                      ? new Date(m.created_at).toLocaleTimeString()
                      : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMsgMenuId(m.id)}
                  className="text-[10px] text-zinc-500 mt-1 px-1"
                >
                  ···
                </button>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-cyan-900/30 bg-black/70 backdrop-blur p-3 flex gap-2 items-center">
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
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              sendText()
            }
          }}
          placeholder="Message…"
          className="flex-1 p-3 rounded-xl bg-zinc-900 border border-zinc-700 text-sm"
        />
        <button
          onClick={sendText}
          disabled={sending || uploading}
          className="bg-cyan-500 text-black font-medium px-4 py-3 rounded-xl disabled:opacity-50"
        >
          Send
        </button>
      </div>

      {msgMenuId && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl p-4">
            <button
              className="w-full text-left py-3 border-b border-zinc-800 text-yellow-400"
              onClick={() => {
                setReportMessageId(msgMenuId)
                setModal('report-msg')
                setMsgMenuId(null)
              }}
            >
              Report this message / media
            </button>
            <button
              className="w-full text-left py-3 text-zinc-400"
              onClick={() => setMsgMenuId(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showMembers && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl p-5 max-h-[70vh] overflow-y-auto">
            <div className="flex justify-between mb-4">
              <p className="font-semibold">Members</p>
              <button
                onClick={() => setShowMembers(false)}
                className="text-zinc-400 text-sm"
              >
                Close
              </button>
            </div>
            <div className="space-y-2">
              {members.map((m) => (
                <div
                  key={m.user_id}
                  className="flex items-center justify-between py-2 border-b border-zinc-800"
                >
                  <span className="text-sm">
                    {m.avatar_icon || '🎭'} {m.username}
                    {m.is_admin ? ' · Admin' : ''}
                  </span>
                  {!m.is_admin && (
                    <button
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
