'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  encryptText,
  decryptText,
  looksEncrypted,
  encryptBytes,
  decryptBytes,
} from '@/lib/e2ee'

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
]

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

function asIdList(v: any): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v.filter(Boolean)
  return []
}

function asDurationMap(v: any): Record<string, number> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, number> = {}
  for (const [k, val] of Object.entries(v)) {
    const n = Number(val)
    if (k && (n === 30 || n === 60 || n === 180)) out[k] = n
  }
  return out
}

async function decryptMessageRow(convId: string, row: any) {
  if (!row) return row
  if (row.type === 'text' && row.content && looksEncrypted(row.content)) {
    try {
      const plain = await decryptText(convId, row.content)
      return { ...row, content: plain }
    } catch {
      return { ...row, content: '[unable to decrypt]' }
    }
  }
  return row
}

function guessMimeFromUrl(url: string) {
  const lower = (url || '').toLowerCase()
  if (lower.includes('.png')) return 'image/png'
  if (lower.includes('.webp')) return 'image/webp'
  if (lower.includes('.gif')) return 'image/gif'
  if (lower.includes('.mp4')) return 'video/mp4'
  if (lower.includes('.webm')) return 'video/webm'
  if (lower.includes('.pdf')) return 'application/pdf'
  return 'application/octet-stream'
}

async function mediaDisplayUrl(
  convId: string,
  url: string,
  isEnc: boolean
): Promise<string> {
  if (!isEnc || !url) return url
  try {
    const res = await fetch(url)
    if (!res.ok) return url
    const buf = await res.arrayBuffer()
    const plain = await decryptBytes(convId, buf)

    const bytes =
      plain instanceof Uint8Array
        ? plain
        : new Uint8Array(plain as ArrayBuffer)

    const copy = new Uint8Array(bytes.byteLength)
    copy.set(bytes)

    const blob = new Blob([copy], { type: guessMimeFromUrl(url) })
    return URL.createObjectURL(blob)
  } catch {
    return url
  }
}

export default function ChatPage() {
  const params = useParams()
  const targetUsername = params.username as string
  const router = useRouter()

  const [user, setUser] = useState<any>(null)
  const [targetUser, setTargetUser] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [startingNew, setStartingNew] = useState(false)
  const [conversationId, setConversationId] = useState('')
  const [fileCount, setFileCount] = useState(0)
  const [videoCount, setVideoCount] = useState(0)
  const [blocked, setBlocked] = useState(false)
  const [chatExpired, setChatExpired] = useState(false)
  const [chatEndsAt, setChatEndsAt] = useState<string | null>(null)
  const [modal, setModal] = useState<
    'clear' | 'block' | 'report' | 'seal' | 'quiet' | 'ghost' | null
  >(null)
  const [reportReason, setReportReason] = useState('')
  const [reportType, setReportType] = useState('')
  const [reportMessageId, setReportMessageId] = useState<string | null>(null)
  const [warningLevel, setWarningLevel] = useState(0)
  const [warningText, setWarningText] = useState('')
  const [myDuration, setMyDuration] = useState(180)
  const [durationMap, setDurationMap] = useState<Record<string, number>>({})
  const [sealIds, setSealIds] = useState<string[]>([])
  const [quietIds, setQuietIds] = useState<string[]>([])
  const [headerOpen, setHeaderOpen] = useState(true)
  const [msgMenu, setMsgMenu] = useState<'menu' | 'edit' | null>(null)
  const [activeMsg, setActiveMsg] = useState<any>(null)
  const [editText, setEditText] = useState('')
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({})
  const [acceptedSafety, setAcceptedSafety] = useState(false)
  const [showSafety, setShowSafety] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<any>(null)
  const settingsChannelRef = useRef<any>(null)

  const iSealed = user ? sealIds.includes(user.id) : false
  const iQuiet = user ? quietIds.includes(user.id) : false
  const otherSealed = targetUser
    ? sealIds.includes(targetUser.id)
    : false

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    let isMounted = true

    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth')
        return
      }
      if (!isMounted) return
      setUser(user)

      const { data: myProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      if (!myProfile || !isUsernameActive(myProfile)) {
        router.push('/username')
        return
      }

      if (myProfile.status === 'suspended' || myProfile.status === 'banned') {
        router.push('/appeal')
        return
      }

      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', targetUsername)
        .maybeSingle()

      if (!targetProfile || !isUsernameActive(targetProfile)) {
        setLoading(false)
        return
      }

      if (!isMounted) return
      setTargetUser(targetProfile)

      const { data: blockCheck } = await supabase
        .from('blocks')
        .select('id')
        .or(
          `and(blocker_id.eq.${user.id},blocked_id.eq.${targetProfile.id}),and(blocker_id.eq.${targetProfile.id},blocked_id.eq.${user.id})`
        )
        .maybeSingle()

      if (blockCheck) {
        setBlocked(true)
        setLoading(false)
        return
      }

      const participants = [user.id, targetProfile.id].sort()
      const convKey = participants.join('_')

      let { data: conv } = await supabase
        .from('conversations')
        .select('*')
        .eq('participants_key', convKey)
        .maybeSingle()

      if (!conv) {
        const { data: newConv, error } = await supabase
          .from('conversations')
          .insert({
            participants_key: convKey,
            participant_ids: participants,
            created_by: user.id,
          })
          .select()
          .single()
        if (error || !newConv) {
          setLoading(false)
          return
        }
        conv = newConv
      }

      if (!isMounted) return
      setConversationId(conv.id)

      const { data: settings } = await supabase
        .from('conversation_settings')
        .select('*')
        .eq('conversation_id', conv.id)
        .maybeSingle()

      if (settings) {
        const dmap = asDurationMap(settings.duration_minutes)
        setDurationMap(dmap)
        if (dmap[user.id]) setMyDuration(dmap[user.id])
        setSealIds(asIdList(settings.seal_user_ids))
        setQuietIds(asIdList(settings.quiet_user_ids))
        if (settings.expires_at) {
          setChatEndsAt(settings.expires_at)
          if (new Date(settings.expires_at).getTime() <= Date.now()) {
            setChatExpired(true)
          }
        }
      }

      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conv.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })

      const decrypted = await Promise.all(
        (msgs || []).map((m) => decryptMessageRow(conv.id, m))
      )
      if (!isMounted) return
      setMessages(decrypted)

      let files = 0
      let videos = 0
      for (const m of decrypted) {
        if (m.type === 'image' || m.type === 'file') files++
        if (m.type === 'video') videos++
      }
      setFileCount(files)
      setVideoCount(videos)

      setLoading(false)
      setShowSafety(true)
    }

    init()
    return () => {
      isMounted = false
    }
  }, [targetUsername])

  useEffect(() => {
    if (!conversationId || !user) return

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }

    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = await decryptMessageRow(conversationId, payload.new)
            setMessages((prev) => {
              if (prev.some((m) => m.id === row.id)) return prev
              return [...prev, row]
            })
            if (row.type === 'image' || row.type === 'file') {
              setFileCount((c) => c + 1)
            }
            if (row.type === 'video') {
              setVideoCount((c) => c + 1)
            }
          }
          if (payload.eventType === 'UPDATE') {
            if (payload.new.is_deleted) {
              setMessages((prev) => prev.filter((m) => m.id !== payload.new.id))
            } else {
              const row = await decryptMessageRow(conversationId, payload.new)
              setMessages((prev) =>
                prev.map((m) => (m.id === row.id ? row : m))
              )
            }
          }
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, user])

  useEffect(() => {
    if (!conversationId) return

    if (settingsChannelRef.current) {
      supabase.removeChannel(settingsChannelRef.current)
    }

    const ch = supabase
      .channel(`settings-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_settings',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const s = payload.new as any
          if (!s) return
          setDurationMap(asDurationMap(s.duration_minutes))
          setSealIds(asIdList(s.seal_user_ids))
          setQuietIds(asIdList(s.quiet_user_ids))
          if (s.expires_at) {
            setChatEndsAt(s.expires_at)
            if (new Date(s.expires_at).getTime() <= Date.now()) {
              setChatExpired(true)
            }
          }
        }
      )
      .subscribe()

    settingsChannelRef.current = ch
    return () => {
      supabase.removeChannel(ch)
    }
  }, [conversationId])

  useEffect(() => {
    if (!chatEndsAt || chatExpired) return
    const t = setInterval(() => {
      if (new Date(chatEndsAt).getTime() <= Date.now()) {
        setChatExpired(true)
        setMessages([])
      }
    }, 5000)
    return () => clearInterval(t)
  }, [chatEndsAt, chatExpired])

  useEffect(() => {
    const loadMedia = async () => {
      if (!conversationId) return
      const next: Record<string, string> = {}
      for (const m of messages) {
        if (
          (m.type === 'image' || m.type === 'video' || m.type === 'file') &&
          m.content
        ) {
          if (!mediaUrls[m.id]) {
            next[m.id] = await mediaDisplayUrl(
              conversationId,
              m.content,
              !!m.is_encrypted
            )
          }
        }
      }
      if (Object.keys(next).length > 0) {
        setMediaUrls((prev) => ({ ...prev, ...next }))
      }
    }
    loadMedia()
  }, [messages, conversationId])

  const ensureSettings = async () => {
    if (!conversationId || !user) return null
    const { data: existing } = await supabase
      .from('conversation_settings')
      .select('*')
      .eq('conversation_id', conversationId)
      .maybeSingle()

    if (existing) return existing

    const { data: created } = await supabase
      .from('conversation_settings')
      .insert({
        conversation_id: conversationId,
        duration_minutes: { [user.id]: myDuration },
        seal_user_ids: [],
        quiet_user_ids: [],
      })
      .select()
      .single()
    return created
  }

  const setMyChatDuration = async (minutes: number) => {
    if (!user || !conversationId || chatExpired) return
    setMyDuration(minutes)
    const settings = await ensureSettings()
    if (!settings) return

    const map = { ...asDurationMap(settings.duration_minutes), [user.id]: minutes }
    const values = Object.values(map)
    const shortest = values.length ? Math.min(...values) : minutes

    let expires_at = settings.expires_at
    if (messages.length > 0) {
      const first = messages[0]?.created_at
      if (first) {
        expires_at = new Date(
          new Date(first).getTime() + shortest * 60 * 1000
        ).toISOString()
      }
    }

    await supabase
      .from('conversation_settings')
      .update({
        duration_minutes: map,
        expires_at,
      })
      .eq('conversation_id', conversationId)

    setDurationMap(map)
    if (expires_at) setChatEndsAt(expires_at)
  }

  const toggleSeal = async () => {
    if (!user || !conversationId) return
    const settings = await ensureSettings()
    if (!settings) return
    const list = asIdList(settings.seal_user_ids)
    const next = list.includes(user.id)
      ? list.filter((id) => id !== user.id)
      : [...list, user.id]
    await supabase
      .from('conversation_settings')
      .update({ seal_user_ids: next })
      .eq('conversation_id', conversationId)
    setSealIds(next)
    setModal(null)
  }

  const toggleQuiet = async () => {
    if (!user || !conversationId) return
    const settings = await ensureSettings()
    if (!settings) return
    const list = asIdList(settings.quiet_user_ids)
    const next = list.includes(user.id)
      ? list.filter((id) => id !== user.id)
      : [...list, user.id]
    await supabase
      .from('conversation_settings')
      .update({ quiet_user_ids: next })
      .eq('conversation_id', conversationId)
    setQuietIds(next)
    setModal(null)
  }

  const doGhost = async () => {
    if (!user) return
    await supabase
      .from('profiles')
      .update({ is_offline: true })
      .eq('id', user.id)
    setModal(null)
    router.push('/home')
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !conversationId || chatExpired || blocked)
      return
    if (!acceptedSafety) {
      setShowSafety(true)
      return
    }

    const text = newMessage.trim()
    setNewMessage('')

    let content = text
    let is_encrypted = false
    try {
      content = await encryptText(conversationId, text)
      is_encrypted = true
    } catch {
      content = text
    }

    const { error } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content,
      type: 'text',
      is_encrypted,
      is_deleted: false,
    })

    if (error) {
      setNewMessage(text)
      return
    }

    if (messages.length === 0) {
      const settings = await ensureSettings()
      const map = {
        ...asDurationMap(settings?.duration_minutes),
        [user.id]: myDuration,
      }
      const values = Object.values(map)
      const shortest = values.length ? Math.min(...values) : myDuration
      const expires_at = new Date(
        Date.now() + shortest * 60 * 1000
      ).toISOString()
      await supabase
        .from('conversation_settings')
        .update({
          duration_minutes: map,
          expires_at,
          first_message_at: new Date().toISOString(),
        })
        .eq('conversation_id', conversationId)
      setChatEndsAt(expires_at)
    }

    checkInterrogation(text)
  }

  const checkInterrogation = (text: string) => {
    const q = (text.match(/\?/g) || []).length
    if (q >= 3) {
      setWarningLevel((w) => {
        const next = w + 1
        if (next === 1) {
          setWarningText('You are asking a lot of questions. Please slow down.')
        } else if (next >= 2) {
          setWarningText(
            'Anti-interrogation: chat time reduced. Please respect the other person.'
          )
          setMyChatDuration(30)
        }
        return next
      })
    }
  }

  const uploadMedia = async (
    file: File,
    type: 'image' | 'video' | 'file'
  ) => {
    if (!user || !conversationId || chatExpired || blocked) return
    if (!acceptedSafety) {
      setShowSafety(true)
      return
    }
    if (type !== 'video' && fileCount >= 4) return
    if (type === 'video' && videoCount >= 1) return

    const ext = file.name.split('.').pop() || 'bin'
    const path = `${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    let body: Blob | ArrayBuffer = file
    let is_encrypted = false
    try {
      const buf = await file.arrayBuffer()
      const enc = await encryptBytes(conversationId, new Uint8Array(buf))
      body = enc
      is_encrypted = true
    } catch {
      body = file
    }

    const { error: upErr } = await supabase.storage
      .from('chat-photos')
      .upload(path, body, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })

    if (upErr) return

    const {
      data: { publicUrl },
    } = supabase.storage.from('chat-photos').getPublicUrl(path)

    await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: publicUrl,
      type,
      is_encrypted,
      is_deleted: false,
    })
  }

  const deleteMessage = async (id: string) => {
    if (!user) return
    await supabase
      .from('messages')
      .update({ is_deleted: true, content: '' })
      .eq('id', id)
      .eq('sender_id', user.id)
    setMessages((prev) => prev.filter((m) => m.id !== id))
    setMsgMenu(null)
    setActiveMsg(null)
  }

  const saveEditMessage = async () => {
    if (!activeMsg || !user || !editText.trim() || !conversationId) return
    let content = editText.trim()
    let is_encrypted = false
    try {
      content = await encryptText(conversationId, content)
      is_encrypted = true
    } catch {
      /* keep plain */
    }
    await supabase
      .from('messages')
      .update({ content, is_encrypted })
      .eq('id', activeMsg.id)
      .eq('sender_id', user.id)
    setMessages((prev) =>
      prev.map((m) =>
        m.id === activeMsg.id
          ? { ...m, content: editText.trim(), is_encrypted }
          : m
      )
    )
    setMsgMenu(null)
    setActiveMsg(null)
  }

  const clearChat = async () => {
    if (!conversationId || !user) return
    await supabase
      .from('messages')
      .update({ is_deleted: true, content: '' })
      .eq('conversation_id', conversationId)
    setMessages([])
    setModal(null)
  }

  const confirmBlockUser = async () => {
    if (!user || !targetUser) return
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/block', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ blocked_id: targetUser.id }),
    })
    setBlocked(true)
    setModal(null)
  }

  const confirmReportUser = async () => {
    if (!user || !targetUser || !reportType || !reportReason.trim()) return
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({
        reported_id: targetUser.id,
        conversation_id: conversationId,
        reason: `${reportType}: ${reportReason}`,
        message_id: reportMessageId,
      }),
    })
    setModal(null)
    setReportReason('')
    setReportType('')
    setReportMessageId(null)
  }

  const startNewChat = async () => {
    if (otherSealed || iSealed) return
    setStartingNew(true)
    setChatExpired(false)
    setMessages([])
    setChatEndsAt(null)
    setWarningLevel(0)
    setWarningText('')
    setAcceptedSafety(false)
    setShowSafety(true)
    setStartingNew(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-zinc-400">Loading chat...</p>
      </div>
    )
  }

  if (!targetUser) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-zinc-400 mb-4">User not found or username expired</p>
          <button
            onClick={() => router.push('/search')}
            className="bg-cyan-500 text-black px-6 py-3 rounded-xl font-medium"
          >
            Back to Search
          </button>
        </div>
      </div>
    )
  }

  if (blocked) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-zinc-400 mb-4">Chat unavailable</p>
          <button
            onClick={() => router.push('/home')}
            className="bg-cyan-500 text-black px-6 py-3 rounded-xl font-medium"
          >
            Go Home
          </button>
        </div>
      </div>
    )
  }
    return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div
        className="flex-1 flex flex-col max-w-lg mx-auto w-full"
        style={{
          background:
            'radial-gradient(ellipse at top, #0c1222 0%, #000000 55%, #000000 100%)',
        }}
      >
        {/* Header */}
        <div className="sticky top-0 z-20 bg-black/90 border-b border-zinc-800 px-3 pt-3 pb-2">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-zinc-500">Chatting with</p>
              <p className="text-lg font-semibold text-cyan-400 truncate">
                {targetUser.avatar_icon || '🎭'} {targetUsername}
              </p>
              <p className="text-[11px] text-zinc-500 leading-snug">
                No last seen. No read receipts. Text encrypted
              </p>
              <p className="text-[11px] text-zinc-500">
                Chat length (from first message)
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[11px] text-zinc-400">
                {fileCount}/4 files · {videoCount}/1 video
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            {DURATION_OPTIONS.map((opt) => (
              <button
                key={opt.minutes}
                type="button"
                onClick={() => setMyChatDuration(opt.minutes)}
                disabled={chatExpired}
                className={`text-xs px-2.5 py-1 rounded-lg border transition ${
                  myDuration === opt.minutes
                    ? 'bg-cyan-500 text-black border-cyan-400 font-semibold'
                    : 'bg-zinc-900 text-zinc-300 border-zinc-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setModal('clear')}
              className="text-xs px-2.5 py-1 rounded-lg bg-orange-600/90 text-white font-medium"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                setReportMessageId(null)
                setModal('report')
              }}
              className="text-xs px-2.5 py-1 rounded-lg bg-yellow-600 text-white font-medium"
            >
              Report
            </button>
            <button
              type="button"
              onClick={() => setModal('block')}
              className="text-xs px-2.5 py-1 rounded-lg bg-red-600 text-white font-medium"
            >
              Block
            </button>
            <button
              type="button"
              onClick={() => setHeaderOpen((v) => !v)}
              className="text-xs px-2.5 py-1 rounded-lg bg-cyan-700 text-white font-medium ml-auto"
            >
              More
            </button>
          </div>

          {headerOpen && (
            <div className="flex flex-wrap gap-1.5 mb-1">
              <button
                type="button"
                onClick={() => setModal('seal')}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium border ${
                  iSealed
                    ? 'bg-cyan-500 text-black border-cyan-400'
                    : 'bg-zinc-900 text-cyan-300 border-zinc-700'
                }`}
              >
                Seal
              </button>
              <button
                type="button"
                onClick={() => setModal('quiet')}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium border ${
                  iQuiet
                    ? 'bg-cyan-500 text-black border-cyan-400'
                    : 'bg-zinc-900 text-cyan-300 border-zinc-700'
                }`}
              >
                Quiet
              </button>
              <button
                type="button"
                onClick={() => setModal('ghost')}
                className="text-xs px-3 py-1.5 rounded-lg font-medium border bg-zinc-900 text-cyan-300 border-zinc-700"
              >
                Ghost
              </button>
              <button
                type="button"
                onClick={() => router.push('/home')}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-zinc-100 text-black ml-auto"
              >
                ← Back
              </button>
            </div>
          )}
        </div>

        {warningText && (
          <div className="mx-3 mt-2 px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-100 text-sm">
            {warningText}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
          {chatExpired ? (
            <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4">
              <p className="text-2xl font-semibold text-cyan-400 mb-2">
                This chat has vanished
              </p>
              <p className="text-sm text-zinc-500 mb-6">
                Messages are gone. Nothing left to read.
              </p>
              {!otherSealed && !iSealed && (
                <button
                  type="button"
                  onClick={startNewChat}
                  disabled={startingNew}
                  className="w-full max-w-xs bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-3 rounded-xl mb-3"
                >
                  {startingNew ? 'Please wait...' : 'Start New Chat'}
                </button>
              )}
              <button
                type="button"
                onClick={() => router.push('/home')}
                className="w-full max-w-xs bg-zinc-800 hover:bg-zinc-700 text-white py-3 rounded-xl mb-2 border border-zinc-700"
              >
                Go Home
              </button>
              <button
                type="button"
                onClick={() => router.push('/search')}
                className="w-full max-w-xs text-cyan-400 text-sm py-2"
              >
                Search users
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center min-h-[40vh]">
              <p className="text-zinc-500 text-center text-sm">
                No messages yet. Say something.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const mine = msg.sender_id === user?.id
              const displayUrl =
                mediaUrls[msg.id] ||
                (msg.is_encrypted ? '' : msg.content)

              return (
                <div
                  key={msg.id}
                  className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setActiveMsg(msg)
                    setEditText(msg.type === 'text' ? msg.content : '')
                    setMsgMenu('menu')
                  }}
                  onTouchStart={() => {
                    const t = window.setTimeout(() => {
                      setActiveMsg(msg)
                      setEditText(msg.type === 'text' ? msg.content : '')
                      setMsgMenu('menu')
                    }, 500)
                    const clear = () => window.clearTimeout(t)
                    window.addEventListener('touchend', clear, { once: true })
                  }}
                >
                  <div
                    className={`relative max-w-[85%] px-3.5 py-2.5 text-[15px] leading-relaxed ${
                      mine
                        ? 'bg-cyan-600/90 text-white rounded-2xl rounded-br-md'
                        : 'bg-zinc-800 text-zinc-100 rounded-2xl rounded-bl-md'
                    }`}
                  >
                    {msg.type === 'text' && (
                      <p className="whitespace-pre-wrap break-words">
                        {msg.content}
                      </p>
                    )}
                    {msg.type === 'image' && displayUrl && (
                      <img
                        src={displayUrl}
                        alt=""
                        className="max-w-[220px] max-h-[280px] rounded-lg object-cover"
                      />
                    )}
                    {msg.type === 'video' && displayUrl && (
                      <video
                        src={displayUrl}
                        controls
                        className="max-w-[220px] max-h-[280px] rounded-lg"
                      />
                    )}
                    {msg.type === 'file' && (
                      <a
                        href={displayUrl || msg.content}
                        target="_blank"
                        rel="noreferrer"
                        className="underline text-sm"
                      >
                        Download file
                      </a>
                    )}
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        {!chatExpired && (
          <div className="sticky bottom-0 bg-black/95 border-t border-zinc-800 p-3">
            <div className="flex items-end gap-2">
              <label className="cursor-pointer shrink-0 bg-zinc-800 hover:bg-zinc-700 w-11 h-11 rounded-xl flex items-center justify-center text-lg">
                📷
                <input
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    if (f.type.startsWith('video/')) uploadMedia(f, 'video')
                    else uploadMedia(f, 'image')
                    e.target.value = ''
                  }}
                />
              </label>
              <label className="cursor-pointer shrink-0 bg-zinc-800 hover:bg-zinc-700 w-11 h-11 rounded-xl flex items-center justify-center text-lg">
                📎
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.ppt,.pptx,.zip"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    uploadMedia(f, 'file')
                    e.target.value = ''
                  }}
                />
              </label>
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                rows={1}
                className="flex-1 min-w-0 p-2.5 rounded-xl bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-cyan-400 text-[15px] resize-none max-h-32"
              />
              <button
                type="button"
                onClick={sendMessage}
                className="shrink-0 bg-cyan-500 hover:bg-cyan-400 text-black font-medium px-4 py-2.5 rounded-xl"
              >
                Send
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Safety modal */}
      {showSafety && !acceptedSafety && !chatExpired && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-3xl p-6">
            <h2 className="text-xl font-semibold mb-3">Before you start</h2>
            <ul className="text-sm text-zinc-300 space-y-2 mb-4 list-disc pl-5">
              <li>Chats are temporary and may disappear after a limited time.</li>
              <li>Do not share passwords, codes, or money details.</li>
              <li>If someone pressures or threatens you, use Report or Block.</li>
              <li>You can leave or clear the chat at any time.</li>
            </ul>
            <p className="text-xs sm:text-sm font-semibold text-cyan-300/95 mb-5 leading-relaxed uppercase tracking-wide">
              NO ONLINE SERVICE CAN GUARANTEE PERFECT SECURITY. DO NOT SHARE
              SECRETS YOU CANNOT AFFORD TO EXPOSE.
            </p>
            <button
              type="button"
              onClick={() => {
                setAcceptedSafety(true)
                setShowSafety(false)
              }}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-medium py-3 rounded-xl"
            >
              I understand — Start
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl p-5">
            {modal === 'clear' && (
              <>
                <h3 className="text-lg font-semibold mb-2">Clear chat?</h3>
                <p className="text-sm text-zinc-400 mb-4">
                  Messages will disappear for both of you right away.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setModal(null)}
                    className="flex-1 bg-zinc-700 py-2.5 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={clearChat}
                    className="flex-1 bg-orange-600 py-2.5 rounded-xl"
                  >
                    Clear
                  </button>
                </div>
              </>
            )}
            {modal === 'block' && (
              <>
                <h3 className="text-lg font-semibold mb-2">
                  Block {targetUsername}?
                </h3>
                <p className="text-sm text-zinc-400 mb-4">
                  You will not find each other in search.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setModal(null)}
                    className="flex-1 bg-zinc-700 py-2.5 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmBlockUser}
                    className="flex-1 bg-red-600 py-2.5 rounded-xl"
                  >
                    Block
                  </button>
                </div>
              </>
            )}
            {modal === 'report' && (
              <>
                <h3 className="text-lg font-semibold mb-2">
                  Report {targetUsername}
                </h3>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {REPORT_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setReportType(type)}
                      className={`text-xs px-2.5 py-1 rounded-lg border ${
                        reportType === type
                          ? 'bg-yellow-600 border-yellow-500 text-white'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-300'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-zinc-400 mb-1">Explain (required)</p>
                <textarea
                  placeholder="What happened?"
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value.slice(0, 400))}
                  rows={3}
                  className="w-full p-3 mb-2 rounded-xl bg-zinc-800 border border-zinc-700 text-sm resize-none"
                />
                <p className="text-[11px] text-zinc-500 mb-4">
                  {reportReason.length}/400
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setModal(null)
                      setReportMessageId(null)
                      setReportType('')
                      setReportReason('')
                    }}
                    className="flex-1 bg-zinc-700 py-2.5 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmReportUser}
                    className="flex-1 bg-yellow-600 py-2.5 rounded-xl font-medium"
                  >
                    Submit
                  </button>
                </div>
              </>
            )}
            {modal === 'seal' && (
              <>
                <h3 className="text-lg font-semibold mb-2">Seal this chat</h3>
                <p className="text-sm text-zinc-400 mb-4">
                  When the chat ends, the other person will not see “Start New
                  Chat”. They will not be told that you sealed it.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setModal(null)}
                    className="flex-1 bg-zinc-700 py-2.5 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={toggleSeal}
                    className="flex-1 bg-cyan-500 text-black font-medium py-2.5 rounded-xl"
                  >
                    {iSealed ? 'Unseal' : 'Seal'}
                  </button>
                </div>
              </>
            )}
            {modal === 'quiet' && (
              <>
                <h3 className="text-lg font-semibold mb-2">Quiet mode</h3>
                <p className="text-sm text-zinc-400 mb-4">
                  Stricter anti-interrogation on your side. The other person is
                  not notified.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setModal(null)}
                    className="flex-1 bg-zinc-700 py-2.5 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={toggleQuiet}
                    className="flex-1 bg-cyan-500 text-black font-medium py-2.5 rounded-xl"
                  >
                    {iQuiet ? 'Turn off Quiet' : 'Turn on Quiet'}
                  </button>
                </div>
              </>
            )}
            {modal === 'ghost' && (
              <>
                <h3 className="text-lg font-semibold mb-2">Ghost</h3>
                <p className="text-sm text-zinc-400 mb-4">
                  You go offline. Others cannot find you in search. You can turn
                  this off later in Profile.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setModal(null)}
                    className="flex-1 bg-zinc-700 py-2.5 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={doGhost}
                    className="flex-1 bg-cyan-500 text-black font-medium py-2.5 rounded-xl"
                  >
                    Go offline
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Message long-press menu */}
      {msgMenu && activeMsg && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl p-4">
            {msgMenu === 'menu' && (
              <>
                {activeMsg.sender_id === user?.id &&
                  activeMsg.type === 'text' && (
                    <button
                      onClick={() => setMsgMenu('edit')}
                      className="w-full text-left py-3 border-b border-zinc-800 text-cyan-400"
                    >
                      Edit message
                    </button>
                  )}
                {activeMsg.sender_id === user?.id && (
                  <button
                    onClick={() => deleteMessage(activeMsg.id)}
                    className="w-full text-left py-3 border-b border-zinc-800 text-red-400"
                  >
                    Vanish this message
                  </button>
                )}
                <button
                  onClick={() => {
                    setReportMessageId(activeMsg.id)
                    setMsgMenu(null)
                    setModal('report')
                  }}
                  className="w-full text-left py-3 border-b border-zinc-800 text-yellow-400"
                >
                  Report this message
                </button>
                <button
                  onClick={() => {
                    setMsgMenu(null)
                    setActiveMsg(null)
                  }}
                  className="w-full text-left py-3 text-zinc-400"
                >
                  Cancel
                </button>
              </>
            )}
            {msgMenu === 'edit' && (
              <>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={3}
                  className="w-full p-3 mb-3 rounded-xl bg-zinc-900 border border-zinc-700 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setMsgMenu('menu')}
                    className="flex-1 bg-zinc-800 py-2.5 rounded-xl"
                  >
                    Back
                  </button>
                  <button
                    onClick={saveEditMessage}
                    className="flex-1 bg-cyan-500 text-black font-medium py-2.5 rounded-xl"
                  >
                    Save
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}