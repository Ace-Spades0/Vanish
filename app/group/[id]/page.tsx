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
  const [uploading, setUploading] = useState(false)
  const [modal, setModal] = useState<'report-group' | 'report-msg' | null>(null)
  const [reportType, setReportType] = useState('')
  const [reportReason, setReportReason] = useState('')
  const [reportMessageId, setReportMessageId] = useState<string | null>(null)
  const [msgMenuId, setMsgMenuId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const mediaRef = useRef<HTMLInputElement>(null)

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

  const uploadMedia = async (
    file: File,
    kind: 'image' | 'video' | 'file'
  ) => {
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
    const url = pub?.publicUrl || path

    const { error: insErr } = await supabase.from('vanish_group_messages').insert({
      group_id: groupId,
      sender_id: user.id,
      body: kind === 'file' ? file.name : '',
      type: kind,
      media_url: url,
      media_path: path,
    })

    if (insErr) setError(insErr.message)
    setUploading(false)
  }

  const onMediaPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.type.startsWith('video/')) {
      await uploadMedia(file, 'video')
    } else {
      await uploadMedia(file, 'image')
    }
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

  const submitReport = async () => {
    if (!user || !reportType.trim() || !reportReason.trim()) {
      setError('Choose a type and explain')
      return
    }
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return

    const payload: any = {
      reported_id: group?.admin_id,
      conversation_id: groupId,
      reason: `[GROUP ${modal}] ${reportType}: ${reportReason}`,
    }
    if (reportMessageId) {
      payload.reason += ` | message:${reportMessageId}`
    }

    const res = await fetch('/api/report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (data.error) {
      setError(data.error)
      return
    }
    setModal(null)
    setReportType('')
    setReportReason('')
    setReportMessageId(null)
    setMsgMenuId(null)
    setError('Report sent')
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
          className="text-sm font-medium text-black bg-cyan-500 hover:bg-cyan-400 px-4 py-2.5 rounded-xl"
        >
          ← Back
        </button>
      </div>
    )
  }

  const isAdmin = user && group && user.id === group.admin_id

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header — back styled like main chat controls */}
      <div className="border-b border-zinc-800 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/search')}
            className="shrink-0 text-sm font-semibold text-black bg-cyan-500 hover:bg-cyan-400 px-4 py-2.5 rounded-xl"
          >
            ← Back
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-cyan-400 font-semibold text-lg truncate">Group</p>
            <p className="text-[11px] text-zinc-500">
              No last seen · Temporary · Media is view-only
            </p>
            {group?.expires_at && (
              <p className="text-[11px] text-zinc-500">
                Ends {new Date(group.expires_at).toLocaleString()}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <>
              <button
                onClick={createInvite}
                className="text-xs font-medium bg-cyan-600 hover:bg-cyan-500 px-3 py-2 rounded-xl"
              >
                Vanish link
              </button>
              <button
                onClick={endGroup}
                className="text-xs font-medium bg-red-700 hover:bg-red-600 px-3 py-2 rounded-xl"
              >
                End group
              </button>
            </>
          )}
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

        {inviteLink && (
          <p className="text-xs text-cyan-300 break-all bg-zinc-900 p-2 rounded-lg">
            {inviteLink}
          </p>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <p className="text-center text-zinc-500 text-sm py-16">
            No messages yet. Say something.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === user?.id
            return (
              <div
                key={m.id}
                className={`max-w-[85%] ${mine ? 'ml-auto' : ''}`}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setMsgMenuId(m.id)
                }}
              >
                <div
                  className={`px-3 py-2 rounded-2xl text-[15px] ${
                    mine
                      ? 'bg-cyan-900/40 border border-cyan-800'
                      : 'bg-zinc-900 border border-zinc-800'
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
                      File (view session only): {m.body || 'attachment'}
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

      {/* Composer — camera + pin, no download affordance */}
      <div className="border-t border-zinc-800 p-3 flex gap-2 items-center">
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
          className="shrink-0 w-11 h-11 rounded-xl bg-zinc-800 border border-zinc-600 flex items-center justify-center text-lg"
          title="Photo or video"
        >
          📷
        </button>
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="shrink-0 w-11 h-11 rounded-xl bg-zinc-800 border border-zinc-600 flex items-center justify-center text-lg"
          title="File"
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

      {/* Message menu */}
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

      {/* Report modal */}
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