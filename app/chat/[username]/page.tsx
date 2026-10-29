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
  if (row.type === 'text' && row.content) {
    if (!looksEncrypted(row.content) && !row.is_encrypted) return row
    try {
      const plain = await decryptText(convId, row.content)
      return { ...row, content: plain }
    } catch {
      return { ...row, content: '[Unable to decrypt]' }
    }
  }
  return row
}

function guessMimeFromUrl(url: string): string {
  const u = url.toLowerCase()
  if (u.includes('.png')) return 'image/png'
  if (u.includes('.gif')) return 'image/gif'
  if (u.includes('.webp')) return 'image/webp'
  if (u.includes('.mp4')) return 'video/mp4'
  if (u.includes('.webm')) return 'video/webm'
  if (u.includes('.mov')) return 'video/quicktime'
  if (u.includes('.pdf')) return 'application/pdf'
  return 'image/jpeg'
}

async function mediaDisplayUrl(
  convId: string,
  url: string,
  isEnc: boolean
): Promise<string> {
  if (!url) return url
  if (!isEnc) return url
  try {
    const res = await fetch(url)
    if (!res.ok) return url
    const buf = await res.arrayBuffer()
    const plain = await decryptBytes(convId, buf)
    const bytes = new Uint8Array(plain)
    const copy = new Uint8Array(bytes.byteLength)
    copy.set(bytes)
    const mime = guessMimeFromUrl(url)
    const blob = new Blob([copy], { type: mime })
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
  const [firstMsgAt, setFirstMsgAt] = useState<string | null>(null)
  const [modal, setModal] = useState<
    'clear' | 'block' | 'report' | 'safety' | 'ghost' | null
  >(null)
  const [safetyNext, setSafetyNext] = useState<'enter' | 'newchat'>('enter')
  const [reportType, setReportType] = useState('')
  const [reportReason, setReportReason] = useState('')
  const [reportMessageId, setReportMessageId] = useState<string | null>(null)
  const [reportMessagePreview, setReportMessagePreview] = useState('')
  const [warningLevel, setWarningLevel] = useState(0)
  const [warningText, setWarningText] = useState('')
  const [activeMsg, setActiveMsg] = useState<any>(null)
  const [editText, setEditText] = useState('')
  const [msgMenu, setMsgMenu] = useState<'menu' | 'edit' | null>(null)
  const [ghostReply, setGhostReply] = useState(false)
  const [sealed, setSealed] = useState(false)
  const [headerOpen, setHeaderOpen] = useState(false)
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({})

  const [sealUserIds, setSealUserIds] = useState<string[]>([])
  const [quietUserIds, setQuietUserIds] = useState<string[]>([])
  const [durationByUser, setDurationByUser] = useState<Record<string, number>>(
    {}
  )
  const [savingSeal, setSavingSeal] = useState(false)
  const [savingQuiet, setSavingQuiet] = useState(false)
  const [savingDuration, setSavingDuration] = useState(false)
  const [sealConfirm, setSealConfirm] = useState<'on' | 'off' | null>(null)
  const [quietConfirm, setQuietConfirm] = useState<'on' | 'off' | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<any>(null)
  const profileChannelRef = useRef<any>(null)
  const settingsChannelRef = useRef<any>(null)
  const hadMessagesRef = useRef(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mediaInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textAreaRef = useRef<HTMLTextAreaElement>(null)

  const mySealOn = !!(user?.id && sealUserIds.includes(user.id))
  const myQuietOn = !!(user?.id && quietUserIds.includes(user.id))
  const myDuration = (user?.id && durationByUser[user.id]) || 180
  const effectiveMinutes = Math.min(
    myDuration,
    (targetUser?.id && durationByUser[targetUser.id]) || 180
  )

  const getConversationEnd = (firstCreatedAt: string, minutes: number) =>
    new Date(
      new Date(firstCreatedAt).getTime() + minutes * 60 * 1000
    ).toISOString()

  const recountMedia = (list: any[]) => {
    setFileCount(
      list.filter((m) => m.type === 'file' || m.type === 'image').length
    )
    setVideoCount(list.filter((m) => m.type === 'video').length)
  }

  const resolveMediaList = async (convId: string, list: any[]) => {
    const next: Record<string, string> = {}
    for (const m of list) {
      if (m.type === 'image' || m.type === 'video' || m.type === 'file') {
        next[m.id] = await mediaDisplayUrl(
          convId,
          m.content,
          !!m.is_encrypted
        )
      }
    }
    setMediaUrls((prev) => ({ ...prev, ...next }))
  }

  const canStartNewChat = () => {
    if (!user?.id || !targetUser?.id) return true
    return !sealUserIds.includes(targetUser.id)
  }

  const recomputeEnd = (
    firstAt: string | null,
    map: Record<string, number>
  ) => {
    if (!firstAt || !user?.id || !targetUser?.id) {
      setChatEndsAt(null)
      return
    }
    const mins = Math.min(map[user.id] || 180, map[targetUser.id] || 180)
    const ends = getConversationEnd(firstAt, mins)
    setChatEndsAt(ends)
    if (new Date(ends).getTime() <= Date.now()) {
      setChatExpired(true)
    }
  }

  const growTextarea = () => {
    const el = textAreaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.overflow = 'hidden'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

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
        .select(
          'username, username_claimed_at, is_permanent_username, status, suspended_until'
        )
        .eq('id', user.id)
        .maybeSingle()

      if (myProfile?.status === 'banned') {
        await supabase.auth.signOut()
        router.push('/auth')
        return
      }
      if (myProfile?.status === 'suspended') {
        const until = myProfile.suspended_until
          ? new Date(myProfile.suspended_until).getTime()
          : null
        if (!until || until > Date.now()) {
          router.push('/appeal')
          return
        }
      }
      if (!isUsernameActive(myProfile || {})) {
        router.push('/username')
        return
      }

      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('*')
        .ilike('username', targetUsername)
        .maybeSingle()

      if (!targetProfile || !isUsernameActive(targetProfile)) {
        setBlocked(true)
        setLoading(false)
        return
      }
      setTargetUser(targetProfile)

      const { data: blocks } = await supabase
        .from('blocks')
        .select('id')
        .or(
          `and(blocker_id.eq.${user.id},blocked_id.eq.${targetProfile.id}),and(blocker_id.eq.${targetProfile.id},blocked_id.eq.${user.id})`
        )
      if (blocks && blocks.length > 0) {
        setBlocked(true)
        setLoading(false)
        return
      }

      const convId = [myProfile!.username, targetProfile.username]
        .sort()
        .join('_')
      setConversationId(convId)

      const { data: settings } = await supabase
        .from('conversation_settings')
        .select(
          'duration_minutes, duration_by_user, seal_user_ids, quiet_user_ids, sealed_by'
        )
        .eq('conversation_id', convId)
        .maybeSingle()

      let map = asDurationMap(settings?.duration_by_user)
      if (
        Object.keys(map).length === 0 &&
        settings?.duration_minutes &&
        [30, 60, 180].includes(settings.duration_minutes)
      ) {
        map = { [user.id]: settings.duration_minutes }
      }
      setDurationByUser(map)

      let seals = asIdList(settings?.seal_user_ids)
      if (seals.length === 0 && settings?.sealed_by) seals = [settings.sealed_by]
      setSealUserIds(seals)
      setQuietUserIds(asIdList(settings?.quiet_user_ids))

      await supabase
        .from('messages')
        .delete()
        .eq('conversation_id', convId)
        .lt('expires_at', new Date().toISOString())

      const { data: existingMessages } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', convId)
        .eq('deleted', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true })

      const list = existingMessages || []
      if (list.length > 0) {
        const firstCreatedAt = list[0].created_at
        setFirstMsgAt(firstCreatedAt)
        const mins = Math.min(
          map[user.id] || 180,
          map[targetProfile.id] || 180
        )
        const endsAt = getConversationEnd(firstCreatedAt, mins)
        setChatEndsAt(endsAt)
        if (new Date(endsAt).getTime() <= Date.now()) {
          await supabase
            .from('messages')
            .update({ deleted: true })
            .eq('conversation_id', convId)
          setMessages([])
          setChatExpired(true)
          setLoading(false)
          return
        }
        hadMessagesRef.current = true
        const decrypted = await Promise.all(
          list.map((m) => decryptMessageRow(convId, m))
        )
        if (isMounted) {
          setMessages(decrypted)
          recountMedia(decrypted)
          await resolveMediaList(convId, decrypted)
        }
      } else {
        setFirstMsgAt(null)
        setChatEndsAt(null)
        setMessages([])
        hadMessagesRef.current = false
      }

      if (!isMounted) return
      setLoading(false)
      setSafetyNext('enter')
      setModal('safety')

      if (channelRef.current) supabase.removeChannel(channelRef.current)
      if (profileChannelRef.current)
        supabase.removeChannel(profileChannelRef.current)
      if (settingsChannelRef.current)
        supabase.removeChannel(settingsChannelRef.current)

      const channel = supabase.channel(`chat-${convId}`)
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${convId}`,
        },
        async (payload) => {
          if (payload.new.deleted) return
          hadMessagesRef.current = true
          setSealed(false)
          setChatExpired(false)
          const row = await decryptMessageRow(convId, payload.new)
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev
            if (prev.length === 0) setFirstMsgAt(row.created_at)
            const next = [...prev, row]
            recountMedia(next)
            return next
          })
          if (
            row.type === 'image' ||
            row.type === 'video' ||
            row.type === 'file'
          ) {
            const u = await mediaDisplayUrl(
              convId,
              row.content,
              !!row.is_encrypted
            )
            setMediaUrls((prev) => ({ ...prev, [row.id]: u }))
          }
        }
      )
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${convId}`,
        },
        async (payload) => {
          const row = payload.new as any
          if (row.deleted) {
            setMessages((prev) => {
              const next = prev.filter((m) => m.id !== row.id)
              recountMedia(next)
              if (hadMessagesRef.current && next.length === 0) setSealed(true)
              return next
            })
            return
          }
          const dec = await decryptMessageRow(convId, row)
          setMessages((prev) =>
            prev.map((m) => (m.id === dec.id ? { ...m, ...dec } : m))
          )
        }
      )
      channel.subscribe()
      channelRef.current = channel

      settingsChannelRef.current = supabase
        .channel(`settings-${convId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'conversation_settings',
            filter: `conversation_id=eq.${convId}`,
          },
          (payload) => {
            const row = payload.new as any
            if (!row) return
            if (row.duration_by_user)
              setDurationByUser(asDurationMap(row.duration_by_user))
            if (row.seal_user_ids) setSealUserIds(asIdList(row.seal_user_ids))
            if (row.quiet_user_ids)
              setQuietUserIds(asIdList(row.quiet_user_ids))
          }
        )
        .subscribe()

      profileChannelRef.current = supabase
        .channel(`chat-profile-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${user.id}`,
          },
          async (payload) => {
            const row = payload.new as any
            if (row?.status === 'banned') {
              await supabase.auth.signOut()
              router.push('/auth')
              return
            }
            if (row?.status === 'suspended') {
              const until = row.suspended_until
                ? new Date(row.suspended_until).getTime()
                : null
              if (!until || until > Date.now()) {
                router.push('/appeal')
              }
            }
          }
        )
        .subscribe()
    }
    init()
    return () => {
      isMounted = false
      if (channelRef.current) supabase.removeChannel(channelRef.current)
      if (profileChannelRef.current)
        supabase.removeChannel(profileChannelRef.current)
      if (settingsChannelRef.current)
        supabase.removeChannel(settingsChannelRef.current)
      if (longPressTimer.current) clearTimeout(longPressTimer.current)
    }
  }, [targetUsername])

  useEffect(() => {
    if (firstMsgAt && user?.id && targetUser?.id) {
      recomputeEnd(firstMsgAt, durationByUser)
    }
  }, [durationByUser, firstMsgAt, user?.id, targetUser?.id])

  useEffect(() => {
    if (!chatEndsAt || chatExpired || !conversationId) return
    const tick = async () => {
      if (new Date(chatEndsAt).getTime() > Date.now()) return
      setChatExpired(true)
      await supabase
        .from('messages')
        .update({ deleted: true })
        .eq('conversation_id', conversationId)
      setMessages([])
      setFileCount(0)
      setVideoCount(0)
      setMediaUrls({})
    }
    tick()
    const id = setInterval(tick, 5000)
    return () => clearInterval(id)
  }, [chatEndsAt, chatExpired, conversationId])

  const saveSettings = async (patch: {
    seal_user_ids?: string[]
    quiet_user_ids?: string[]
    duration_by_user?: Record<string, number>
  }) => {
    const { error } = await supabase.from('conversation_settings').upsert(
      {
        conversation_id: conversationId,
        updated_at: new Date().toISOString(),
        duration_by_user: patch.duration_by_user ?? durationByUser,
        seal_user_ids: patch.seal_user_ids ?? sealUserIds,
        quiet_user_ids: patch.quiet_user_ids ?? quietUserIds,
      },
      { onConflict: 'conversation_id' }
    )
    return error
  }

  const pickMyDuration = async (minutes: number) => {
    if (!user || !conversationId || savingDuration) return
    setSavingDuration(true)
    const next = { ...durationByUser, [user.id]: minutes }
    const error = await saveSettings({ duration_by_user: next })
    if (error) {
      alert(error.message)
      setSavingDuration(false)
      return
    }
    setDurationByUser(next)
    setSavingDuration(false)
  }

  const requestSealToggle = () => {
    if (!user || !conversationId || savingSeal) return
    setSealConfirm(mySealOn ? 'off' : 'on')
  }

  const confirmSealToggle = async () => {
    if (!user || !conversationId || !sealConfirm) return
    setSavingSeal(true)
    setSealConfirm(null)
    let next = [...sealUserIds]
    if (sealConfirm === 'on') {
      if (!next.includes(user.id)) next.push(user.id)
    } else next = next.filter((id) => id !== user.id)
    const error = await saveSettings({ seal_user_ids: next })
    if (error) {
      alert(error.message)
      setSavingSeal(false)
      return
    }
    setSealUserIds(next)
    setSavingSeal(false)
  }

  const requestQuietToggle = () => {
    if (!user || !conversationId || savingQuiet) return
    setQuietConfirm(myQuietOn ? 'off' : 'on')
  }

  const confirmQuietToggle = async () => {
    if (!user || !conversationId || !quietConfirm) return
    setSavingQuiet(true)
    setQuietConfirm(null)
    let next = [...quietUserIds]
    if (quietConfirm === 'on') {
      if (!next.includes(user.id)) next.push(user.id)
    } else next = next.filter((id) => id !== user.id)
    const error = await saveSettings({ quiet_user_ids: next })
    if (error) {
      alert(error.message)
      setSavingQuiet(false)
      return
    }
    setQuietUserIds(next)
    setSavingQuiet(false)
  }

  const runStartNewChat = async () => {
    if (!conversationId || startingNew || !canStartNewChat()) return
    setStartingNew(true)
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('conversation_id', conversationId)
    if (error) {
      await supabase
        .from('messages')
        .update({ deleted: true })
        .eq('conversation_id', conversationId)
    }
    setMessages([])
    setFileCount(0)
    setVideoCount(0)
    setChatEndsAt(null)
    setFirstMsgAt(null)
    setChatExpired(false)
    setSealed(false)
    setWarningLevel(0)
    setWarningText('')
    setNewMessage('')
    setMediaUrls({})
    hadMessagesRef.current = false
    setStartingNew(false)
    if (textAreaRef.current) textAreaRef.current.style.height = 'auto'
  }

  const acceptSafety = async () => {
    setModal(null)
    if (safetyNext === 'newchat') await runStartNewChat()
    setSafetyNext('enter')
  }

  const requestNewChat = () => {
    if (!canStartNewChat()) return
    setSafetyNext('newchat')
    setModal('safety')
  }

  const resolveExpiresAt = async (forceShort: boolean) => {
    if (forceShort) {
      return new Date(Date.now() + 30 * 60 * 1000).toISOString()
    }
    if (firstMsgAt) {
      return getConversationEnd(firstMsgAt, effectiveMinutes)
    }
    return getConversationEnd(new Date().toISOString(), myDuration)
  }

  const countQuestions = (text: string) => {
    const q = (text.match(/\?/g) || []).length
    const starters =
      text.match(
        /\b(why|how|what|when|where|who|which|do you|are you|can you|did you)\b/gi
      ) || []
    return q + starters.length
  }

  const sendMessage = async () => {
    if (!user || !conversationId || !newMessage.trim() || chatExpired || sealed)
      return
    const text = newMessage.trim()
    setNewMessage('')
    if (textAreaRef.current) textAreaRef.current.style.height = 'auto'

    let forceShort = false
    if (myQuietOn || quietUserIds.includes(user.id)) {
      const q = countQuestions(text)
      if (q >= 2) {
        const nextLevel = warningLevel + 1
        setWarningLevel(nextLevel)
        if (nextLevel === 1) {
          setWarningText('You are asking a lot of questions. Please slow down.')
        } else if (nextLevel >= 2) {
          setWarningText('Chat time reduced because of pressure questions.')
          forceShort = true
        }
      }
    }

    const expires_at = await resolveExpiresAt(forceShort)
    if (!firstMsgAt) {
      const nowIso = new Date().toISOString()
      setFirstMsgAt(nowIso)
      recomputeEnd(nowIso, {
        ...durationByUser,
        [user.id]: myDuration,
      })
    }

    let content = text
    let is_encrypted = false
    try {
      content = await encryptText(conversationId, text)
      is_encrypted = true
    } catch {
      content = text
      is_encrypted = false
    }

    const { error } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content,
      type: 'text',
      deleted: false,
      expires_at,
      is_encrypted,
    })
    if (error) {
      alert(error.message)
      return
    }

    if (ghostReply) {
      await supabase
        .from('profiles')
        .update({ is_offline: true })
        .eq('id', user.id)
      setGhostReply(false)
    }
  }

  const uploadMedia = async (
    e: React.ChangeEvent<HTMLInputElement>,
    mode: 'media' | 'file'
  ) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !user || !conversationId || chatExpired || sealed) return

    const isVideo = file.type.startsWith('video/')
    const isImage = file.type.startsWith('image/')
    let type: 'image' | 'video' | 'file' = 'file'
    if (mode === 'media') {
      if (isVideo) type = 'video'
      else if (isImage) type = 'image'
      else type = 'file'
    }

    if (type === 'video' && videoCount >= 1) {
      alert('Video limit reached')
      return
    }
    if ((type === 'image' || type === 'file') && fileCount >= 4) {
      alert('File/photo limit reached')
      return
    }

    const expires_at = await resolveExpiresAt(false)
    if (!firstMsgAt) {
      const now = new Date().toISOString()
      setFirstMsgAt(now)
      recomputeEnd(now, durationByUser)
    }

    let uploadBody: ArrayBuffer | Blob = file
    let is_encrypted = false
    try {
      const buf = await file.arrayBuffer()
      const enc = await encryptBytes(conversationId, buf)
      uploadBody = enc
      is_encrypted = true
    } catch {
      uploadBody = file
      is_encrypted = false
    }

    const path = `${conversationId}/${user.id}/${Date.now()}-${file.name.replace(
      /[^a-zA-Z0-9._-]/g,
      '_'
    )}`
    const { error: upErr } = await supabase.storage
      .from('chat-photos')
      .upload(path, uploadBody, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })
    if (upErr) {
      alert(upErr.message)
      return
    }
    const { data: pub } = supabase.storage.from('chat-photos').getPublicUrl(path)
    const { error } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: pub.publicUrl,
      type,
      deleted: false,
      expires_at,
      is_encrypted,
    })
    if (error) alert(error.message)
  }

  const clearChat = async () => {
    if (!conversationId) return
    await supabase
      .from('messages')
      .update({ deleted: true })
      .eq('conversation_id', conversationId)
    setMessages([])
    setFileCount(0)
    setVideoCount(0)
    setMediaUrls({})
    setSealed(true)
    setModal(null)
  }

  const confirmBlockUser = async () => {
    if (!user || !targetUser) return
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return
    await fetch('/api/block', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ blocked_id: targetUser.id }),
    })
    setModal(null)
    setBlocked(true)
  }

  const confirmReportUser = async () => {
    if (!user || !targetUser || !reportType.trim() || !reportReason.trim()) {
      alert('Choose a type and explain')
      return
    }
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return
    await fetch('/api/report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        reported_id: targetUser.id,
        conversation_id: conversationId,
        reason: reportMessageId
          ? `[MSG:${reportMessageId}] ${reportType}: ${reportReason}`
          : `${reportType}: ${reportReason}`,
      }),
    })
    setModal(null)
    setReportType('')
    setReportReason('')
    setReportMessageId(null)
    setReportMessagePreview('')
  }

  const vanishOneMessage = async (msg: any) => {
    if (!msg?.id || msg.sender_id !== user?.id) return
    await supabase.from('messages').update({ deleted: true }).eq('id', msg.id)
    setMessages((prev) => prev.filter((m) => m.id !== msg.id))
    setMsgMenu(null)
    setActiveMsg(null)
  }

  const saveEditMessage = async () => {
    if (!activeMsg || activeMsg.sender_id !== user?.id || !editText.trim())
      return
    let content = editText.trim()
    let is_encrypted = false
    try {
      content = await encryptText(conversationId, content)
      is_encrypted = true
    } catch {
      /* plain */
    }
    await supabase
      .from('messages')
      .update({ content, is_encrypted })
      .eq('id', activeMsg.id)
    const plain = editText.trim()
    setMessages((prev) =>
      prev.map((m) =>
        m.id === activeMsg.id ? { ...m, content: plain, is_encrypted } : m
      )
    )
    setMsgMenu(null)
    setActiveMsg(null)
  }

  const openMsgMenu = (msg: any) => {
    setActiveMsg(msg)
    setEditText(msg.type === 'text' ? msg.content || '' : '')
    setMsgMenu('menu')
  }

  const startLongPress = (msg: any) => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressTimer.current = setTimeout(() => openMsgMenu(msg), 450)
  }

  const endLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }

  const srcFor = (msg: any) => mediaUrls[msg.id] || msg.content || ''

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-zinc-400">Loading chat…</p>
      </div>
    )
  }

  if (blocked) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-zinc-400 text-center">Chat unavailable</p>
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
    <div className="min-h-screen bg-black text-white flex flex-col h-screen">
      <div className="shrink-0 border-b border-zinc-800 bg-zinc-950/95 p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-zinc-500">Chatting with</p>
            <p className="text-cyan-400 font-semibold text-lg truncate">
              {targetUser?.avatar_icon || '🎭'} {targetUsername}
            </p>
            <p className="text-[11px] text-zinc-500">
              No last seen. No read receipts. Text encrypted.
            </p>
            <p className="text-[11px] text-zinc-500">
              Chat length (from first message) · your pick highlighted
            </p>
          </div>
          <p className="text-[11px] text-zinc-500 shrink-0">
            {fileCount}/4 files · {videoCount}/1 video
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5 items-center">
          {DURATION_OPTIONS.map((o) => (
            <button
              key={o.minutes}
              type="button"
              disabled={savingDuration}
              onClick={() => pickMyDuration(o.minutes)}
              className={`text-[11px] px-2 py-1 rounded-lg border ${
                myDuration === o.minutes
                  ? 'bg-cyan-500 text-black border-cyan-400'
                  : 'bg-zinc-900 border-zinc-700 text-zinc-300'
              }`}
            >
              {o.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setModal('clear')}
            className="text-[11px] px-2 py-1 rounded-lg bg-orange-700/80"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => {
              setReportMessageId(null)
              setReportMessagePreview('')
              setModal('report')
            }}
            className="text-[11px] px-2 py-1 rounded-lg bg-yellow-700/80"
          >
            Report
          </button>
          <button
            type="button"
            onClick={() => setModal('block')}
            className="text-[11px] px-2 py-1 rounded-lg bg-red-700/80"
          >
            Block
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setHeaderOpen((v) => !v)}
            className="text-[11px] px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700"
          >
            {headerOpen ? 'Less' : 'More'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/home')}
            className="inline-flex items-center gap-2 text-sm font-medium text-cyan-400 border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 px-3 py-1.5 rounded-full transition"
          >
            ← Back to Home
          </button>
        </div>

        {headerOpen && (
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={savingSeal}
              onClick={requestSealToggle}
              className={`text-xs font-medium px-3 py-2 rounded-xl border ${
                mySealOn
                  ? 'bg-cyan-600 border-cyan-400'
                  : 'bg-zinc-900 border-zinc-600'
              }`}
            >
              Seal {mySealOn ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              disabled={savingQuiet}
              onClick={requestQuietToggle}
              className={`text-xs font-medium px-3 py-2 rounded-xl border ${
                myQuietOn
                  ? 'bg-violet-600 border-violet-400'
                  : 'bg-zinc-900 border-zinc-600'
              }`}
            >
              Quiet {myQuietOn ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              onClick={() => setModal('ghost')}
              className={`text-xs font-medium px-3 py-2 rounded-xl border ${
                ghostReply
                  ? 'bg-emerald-600 border-emerald-400'
                  : 'bg-zinc-900 border-zinc-600'
              }`}
            >
              Ghost {ghostReply ? 'armed' : ''}
            </button>
          </div>
        )}

        {warningText && (
          <p className="text-xs text-amber-300">{warningText}</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 relative">
        <div className="pointer-events-none absolute inset-0 opacity-30">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-64 h-64 bg-cyan-500/10 blur-[80px] rounded-full" />
        </div>

        {messages.length === 0 && !chatExpired && !sealed ? (
          <div className="relative z-10 flex items-center justify-center min-h-[40vh]">
            <p className="text-center text-zinc-500 text-sm px-6">
              When you speak, it can vanish.
            </p>
          </div>
        ) : (
          <div className="space-y-3 relative z-10">
            {messages.map((msg) => {
              const mine = msg.sender_id === user?.id
              const mediaSrc = srcFor(msg)
              return (
                <div
                  key={msg.id}
                  className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                  onTouchStart={() => startLongPress(msg)}
                  onTouchEnd={endLongPress}
                  onMouseDown={() => startLongPress(msg)}
                  onMouseUp={endLongPress}
                  onMouseLeave={endLongPress}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    openMsgMenu(msg)
                  }}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                      mine
                        ? 'bg-cyan-600 text-white rounded-br-md shadow-[0_0_24px_rgba(34,211,238,0.25)]'
                        : 'bg-black/75 text-zinc-100 rounded-bl-md border border-cyan-500/20 backdrop-blur-sm'
                    }`}
                  >
                    {msg.type === 'image' && (
                      <div>
                        <img
                          src={mediaSrc}
                          alt=""
                          className="max-w-[220px] max-h-[280px] w-auto h-auto object-contain rounded-lg mb-1"
                        />
                        <a
                          href={mediaSrc}
                          download
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs underline opacity-90"
                        >
                          Download
                        </a>
                      </div>
                    )}
                    {msg.type === 'video' && (
                      <div>
                        <video
                          src={mediaSrc}
                          controls
                          className="max-w-[220px] max-h-[280px] w-auto rounded-lg mb-1"
                        />
                        <a
                          href={mediaSrc}
                          download
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs underline opacity-90"
                        >
                          Download
                        </a>
                      </div>
                    )}
                    {msg.type === 'file' && (
                      <a
                        href={mediaSrc}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm underline break-all"
                      >
                        📎 File — open / download
                      </a>
                    )}
                    {msg.type === 'text' && (
                      <p className="text-[15px] whitespace-pre-wrap break-words leading-relaxed">
                        {msg.content}
                      </p>
                    )}
                    {msg.created_at && (
                      <p
                        className={`text-[10px] mt-1 ${
                          mine
                            ? 'text-cyan-100/70 text-right'
                            : 'text-zinc-500 text-left'
                        }`}
                      >
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {(chatExpired || sealed) && messages.length === 0 && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-950 border border-cyan-500/30 rounded-3xl p-6 shadow-[0_0_40px_rgba(34,211,238,0.15)]">
            <p className="text-center text-2xl font-semibold text-cyan-400 mb-2">
              {chatExpired
                ? 'This chat has Vanished.'
                : 'This chat was cleared.'}
            </p>
            <p className="text-center text-sm text-zinc-500 mb-6">
              Messages are gone. Nothing left to read.
            </p>
            {canStartNewChat() ? (
              <div className="space-y-2">
                <button
                  onClick={requestNewChat}
                  disabled={startingNew}
                  className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-3 rounded-xl disabled:opacity-50"
                >
                  {startingNew ? 'Please wait...' : 'Start a new chat'}
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/home')}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-3 rounded-xl border border-zinc-700"
                >
                  Go home
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/search')}
                  className="w-full bg-zinc-900 hover:bg-zinc-800 text-cyan-400 font-medium py-3 rounded-xl border border-zinc-700"
                >
                  Search users
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-center text-zinc-500 text-sm mb-2">
                  This chat cannot be reopened.
                </p>
                <button
                  type="button"
                  onClick={() => router.push('/home')}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-3 rounded-xl border border-zinc-700"
                >
                  Go home
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/search')}
                  className="w-full bg-zinc-900 hover:bg-zinc-800 text-cyan-400 font-medium py-3 rounded-xl border border-zinc-700"
                >
                  Search users
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {!chatExpired && !sealed && (
        <div className="shrink-0 bg-black border-t border-cyan-500/10 p-2">
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => mediaInputRef.current?.click()}
              className="shrink-0 h-11 w-11 rounded-xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-xl"
              title="Photo / Video"
            >
              📷
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 h-11 w-11 rounded-xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-xl"
              title="File"
            >
              📎
            </button>
            <input
              ref={mediaInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => uploadMedia(e, 'media')}
            />
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => uploadMedia(e, 'file')}
            />
            <textarea
              ref={textAreaRef}
              value={newMessage}
              onChange={(e) => {
                setNewMessage(e.target.value)
                requestAnimationFrame(growTextarea)
              }}
              placeholder="Type a message..."
              rows={1}
              className="flex-1 min-w-0 p-2.5 rounded-xl bg-zinc-900 border border-zinc-700 focus:outline-none focus:border-cyan-400 text-[15px] resize-none overflow-hidden"
              style={{ maxHeight: 160 }}
            />
            <button
              onClick={sendMessage}
              className="shrink-0 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold px-4 h-11 rounded-xl"
            >
              Send
            </button>
          </div>
        </div>
      )}

      {modal === 'safety' && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-950 border border-cyan-500/20 rounded-3xl p-6">
            <h2 className="text-xl font-semibold mb-3">Before you continue</h2>
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
              onClick={acceptSafety}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-medium py-3 rounded-xl"
            >
              I understand — Continue
            </button>
          </div>
        </div>
      )}

      {modal === 'clear' && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-700 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-2">Clear this chat?</h3>
            <p className="text-sm text-zinc-400 mb-4">
              Messages vanish for both of you right away.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setModal(null)}
                className="flex-1 bg-zinc-800 py-2.5 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={clearChat}
                className="flex-1 bg-orange-600 py-2.5 rounded-xl font-medium"
              >
                Clear chat
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'block' && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-700 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-2">
              Block {targetUsername}?
            </h3>
            <p className="text-sm text-zinc-400 mb-4">
              They will not find you in search or chat with you.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setModal(null)}
                className="flex-1 bg-zinc-800 py-2.5 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={confirmBlockUser}
                className="flex-1 bg-red-600 py-2.5 rounded-xl font-medium"
              >
                Block
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'report' && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-700 rounded-2xl p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-2">
              Report {targetUsername}
            </h3>
            {reportMessagePreview && (
              <p className="text-xs text-zinc-500 mb-2 line-clamp-2">
                Message: {reportMessagePreview}
              </p>
            )}
            <p className="text-xs text-zinc-400 mb-2">Type</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {REPORT_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setReportType(type)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border ${
                    reportType === type
                      ? 'bg-yellow-600 border-yellow-400 text-white'
                      : 'bg-zinc-900 border-zinc-600 text-zinc-300'
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
              className="w-full p-3 mb-2 rounded-xl bg-zinc-900 border border-zinc-700 text-sm resize-none"
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
                className="flex-1 bg-zinc-800 py-2.5 rounded-xl"
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
          </div>
        </div>
      )}

      {modal === 'ghost' && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-700 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-2">Ghost mode</h3>
            <p className="text-sm text-zinc-400 mb-4">
              After your next message is sent, you go offline. Others cannot
              find you in Search until you turn offline off in Profile.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setModal(null)}
                className="flex-1 bg-zinc-800 py-2.5 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setGhostReply(true)
                  setModal(null)
                }}
                className="flex-1 bg-emerald-600 py-2.5 rounded-xl font-medium"
              >
                Enable Ghost
              </button>
            </div>
          </div>
        </div>
      )}

      {sealConfirm && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-700 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-2">
              {sealConfirm === 'on' ? 'Turn Seal on?' : 'Turn Seal off?'}
            </h3>
            <p className="text-sm text-zinc-400 mb-4">
              {sealConfirm === 'on'
                ? 'When this chat ends, the other person will not see “Start a new chat” on their side. They are not told that you used Seal.'
                : 'You stop using Seal for this chat.'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setSealConfirm(null)}
                className="flex-1 bg-zinc-800 py-2.5 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={confirmSealToggle}
                className="flex-1 bg-cyan-600 py-2.5 rounded-xl font-medium"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {quietConfirm && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-700 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-2">
              {quietConfirm === 'on' ? 'Turn Quiet on?' : 'Turn Quiet off?'}
            </h3>
            <p className="text-sm text-zinc-400 mb-4">
              {quietConfirm === 'on'
                ? 'Anti-interrogation becomes stricter for you. The other person is not notified.'
                : 'Quiet mode off for you.'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setQuietConfirm(null)}
                className="flex-1 bg-zinc-800 py-2.5 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={confirmQuietToggle}
                className="flex-1 bg-violet-600 py-2.5 rounded-xl font-medium"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {msgMenu && activeMsg && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-700 rounded-2xl p-4 w-full max-w-sm">
            {msgMenu === 'menu' && (
              <>
                <p className="text-sm text-zinc-400 mb-3 line-clamp-2">
                  {activeMsg.type === 'text'
                    ? activeMsg.content
                    : `[${activeMsg.type}]`}
                </p>
                {activeMsg.sender_id === user?.id &&
                  activeMsg.type === 'text' && (
                    <button
                      onClick={() => setMsgMenu('edit')}
                      className="w-full text-left py-3 border-b border-zinc-800"
                    >
                      Edit
                    </button>
                  )}
                {activeMsg.sender_id === user?.id && (
                  <button
                    onClick={() => vanishOneMessage(activeMsg)}
                    className="w-full text-left py-3 border-b border-zinc-800 text-orange-400"
                  >
                    Vanish this message
                  </button>
                )}
                <button
                  onClick={() => {
                    setReportMessageId(activeMsg.id)
                    setReportMessagePreview(
                      activeMsg.type === 'text'
                        ? activeMsg.content
                        : `[${activeMsg.type}]`
                    )
                    setReportType('')
                    setReportReason('')
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