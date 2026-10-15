'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { encryptText, decryptText, looksEncrypted } from '@/lib/e2ee'

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
  if (!row || row.type !== 'text' || !row.content) return row
  if (!looksEncrypted(row.content) && !row.is_encrypted) return row
  try {
    const plain = await decryptText(convId, row.content)
    return { ...row, content: plain }
  } catch {
    return { ...row, content: '[Unable to decrypt]' }
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

  const [sealUserIds, setSealUserIds] = useState<string[]>([])
  const [quietUserIds, setQuietUserIds] = useState<string[]>([])
  const [durationByUser, setDurationByUser] = useState<Record<string, number>>({})
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

  const durationLabel = (m: number) =>
    DURATION_OPTIONS.find((o) => o.minutes === m)?.label || '3h'

  const recountMedia = (list: any[]) => {
    setFileCount(list.filter((m) => m.type === 'file' || m.type === 'image').length)
    setVideoCount(list.filter((m) => m.type === 'video').length)
  }

  const canStartNewChat = () => {
    if (!user?.id || !targetUser?.id) return true
    return !sealUserIds.includes(targetUser.id)
  }

  const recomputeEnd = (firstAt: string | null, map: Record<string, number>) => {
    if (!firstAt || !user?.id || !targetUser?.id) {
      setChatEndsAt(null)
      return
    }
    const mins = Math.min(map[user.id] || 180, map[targetUser.id] || 180)
    const ends = getConversationEnd(firstAt, mins)
    setChatEndsAt(ends)
    if (new Date(ends).getTime() <= Date.now()) {
      setChatExpired(true)
      setSealed(true)
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
        if (!(until && until <= Date.now())) {
          await supabase.auth.signOut()
          router.push('/auth')
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

      const convId = [myProfile!.username, targetProfile.username].sort().join('_')
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
        const mins = Math.min(map[user.id] || 180, map[targetProfile.id] || 180)
        const endsAt = getConversationEnd(firstCreatedAt, mins)
        setChatEndsAt(endsAt)
        if (new Date(endsAt).getTime() <= Date.now()) {
          await supabase
            .from('messages')
            .update({ deleted: true })
            .eq('conversation_id', convId)
          setMessages([])
          setChatExpired(true)
          setSealed(true)
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
      if (profileChannelRef.current) supabase.removeChannel(profileChannelRef.current)
      if (settingsChannelRef.current) supabase.removeChannel(settingsChannelRef.current)

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
            if (row.quiet_user_ids) setQuietUserIds(asIdList(row.quiet_user_ids))
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
              if (!(until && until <= Date.now())) {
                await supabase.auth.signOut()
                router.push('/auth')
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
      if (profileChannelRef.current) supabase.removeChannel(profileChannelRef.current)
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
    if (forceShort) return new Date(Date.now() + 30 * 60 * 1000).toISOString()
    const mins = effectiveMinutes
    if (chatEndsAt) return chatEndsAt
    const { data: firstRows } = await supabase
      .from('messages')
      .select('created_at')
      .eq('conversation_id', conversationId)
      .eq('deleted', false)
      .order('created_at', { ascending: true })
      .limit(1)
    if (firstRows?.[0]?.created_at) {
      setFirstMsgAt(firstRows[0].created_at)
      const endsAt = getConversationEnd(firstRows[0].created_at, mins)
      setChatEndsAt(endsAt)
      return endsAt
    }
    const endsAt = new Date(Date.now() + mins * 60 * 1000).toISOString()
    setChatEndsAt(endsAt)
    return endsAt
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !conversationId || chatExpired || sealed)
      return
    const content = newMessage.trim()
    setNewMessage('')
    if (textAreaRef.current) textAreaRef.current.style.height = 'auto'

    const myQuestions = messages.filter(
      (m) => m.sender_id === user.id && m.content?.trim().endsWith('?')
    ).length
    const isQuestion = content.endsWith('?')
    const totalQuestions = isQuestion ? myQuestions + 1 : myQuestions
    const qThreshold = myQuietOn ? 3 : 6
    const interrogationDetected = isQuestion && totalQuestions >= qThreshold
    let useShortExpiry = warningLevel >= 2
    if (interrogationDetected) {
      if (warningLevel < 2) {
        const nextLevel = warningLevel + 1
        setWarningLevel(nextLevel)
        setWarningText(
          nextLevel === 1
            ? 'You are asking a lot of questions. Please slow down.'
            : 'Final warning: continued questioning may shorten this chat.'
        )
        useShortExpiry = false
      } else {
        useShortExpiry = true
        setWarningText('Anti-interrogation: messages may expire in 30 min.')
      }
    }

    const expiresAt = await resolveExpiresAt(useShortExpiry)
    if (new Date(expiresAt).getTime() <= Date.now()) {
      setChatExpired(true)
      setSealed(true)
      alert('This chat has ended.')
      return
    }

    let payload = content
    try {
      payload = await encryptText(conversationId, content)
    } catch {
      alert('Could not encrypt')
      return
    }

    const { error } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: payload,
      type: 'text',
      is_encrypted: true,
      expires_at: expiresAt,
    })
    if (error) {
      alert(error.message)
      return
    }
    hadMessagesRef.current = true
    if (!firstMsgAt) setFirstMsgAt(new Date().toISOString())
    setSealed(false)
    setChatExpired(false)
    if (ghostReply) {
      await supabase.from('profiles').update({ is_offline: true }).eq('id', user.id)
      setGhostReply(false)
      alert('Ghost on. You are offline in Search.')
    }
  }

  const uploadMedia = async (e: any, mode: 'media' | 'file') => {
    const file = e.target.files?.[0]
    if (!file || !user || !conversationId || chatExpired || sealed) return
    const isVideo = file.type.startsWith('video/')
    const isImage = file.type.startsWith('image/')
    if (mode === 'media' && !isImage && !isVideo) {
      alert('Choose a photo or video')
      e.target.value = ''
      return
    }
    if (isVideo) {
      if (videoCount >= 1) {
        alert('Only 1 video')
        e.target.value = ''
        return
      }
      if (file.size > 30 * 1024 * 1024) {
        alert('Video under 30 MB')
        e.target.value = ''
        return
      }
    } else {
      if (fileCount >= 4) {
        alert('Max 4 files/photos')
        e.target.value = ''
        return
      }
      if (file.size > 15 * 1024 * 1024) {
        alert('File under 15 MB')
        e.target.value = ''
        return
      }
    }
    const expiresAt = await resolveExpiresAt(false)
    if (new Date(expiresAt).getTime() <= Date.now()) {
      setChatExpired(true)
      setSealed(true)
      e.target.value = ''
      return
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const fileName = `${conversationId}/${Date.now()}-${safeName}`
    const { error } = await supabase.storage
      .from('chat-photos')
      .upload(fileName, file)
    if (error) {
      alert('Upload failed')
      e.target.value = ''
      return
    }
    const { data } = supabase.storage.from('chat-photos').getPublicUrl(fileName)
    const type = isVideo ? 'video' : isImage ? 'image' : 'file'
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: data.publicUrl,
      type,
      is_encrypted: false,
      expires_at: expiresAt,
    })
    hadMessagesRef.current = true
    if (!firstMsgAt) setFirstMsgAt(new Date().toISOString())
    setSealed(false)
    setChatExpired(false)
    e.target.value = ''
  }
    const openMsgMenu = (msg: any) => {
    setActiveMsg(msg)
    setEditText(msg.content || '')
    setMsgMenu('menu')
  }

  const startLongPress = (msg: any) => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressTimer.current = setTimeout(() => openMsgMenu(msg), 500)
  }

  const endLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const vanishOneMessage = async (msg: any) => {
    if (!msg?.id || msg.sender_id !== user?.id) return
    await supabase.from('messages').update({ deleted: true }).eq('id', msg.id)
    setMessages((prev) => {
      const next = prev.filter((m) => m.id !== msg.id)
      recountMedia(next)
      return next
    })
    setMsgMenu(null)
    setActiveMsg(null)
  }

  const saveEditMessage = async () => {
    if (!activeMsg || activeMsg.sender_id !== user?.id || !editText.trim()) return
    let payload = editText.trim()
    try {
      payload = await encryptText(conversationId, payload)
    } catch {
      alert('Could not encrypt')
      return
    }
    const { error } = await supabase
      .from('messages')
      .update({ content: payload, is_encrypted: true })
      .eq('id', activeMsg.id)
    if (error) {
      alert(error.message)
      return
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.id === activeMsg.id ? { ...m, content: editText.trim() } : m
      )
    )
    setMsgMenu(null)
    setActiveMsg(null)
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
    setChatEndsAt(null)
    setFirstMsgAt(null)
    setSealed(true)
    setModal(null)
    setSafetyNext('enter')
    setModal('safety')
  }

  const confirmBlockUser = async () => {
    if (!user || !targetUser) return
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const res = await fetch('/api/block', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({ blocked_id: targetUser.id }),
    })
    const data = await res.json()
    if (data.error) {
      alert(data.error)
      return
    }
    setBlocked(true)
    setModal(null)
  }

  const confirmReportUser = async () => {
    if (!user || !targetUser || !reportType || !reportReason.trim()) {
      alert('Choose a type and explain')
      return
    }
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const res = await fetch('/api/report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({
        reported_id: targetUser.id,
        conversation_id: conversationId,
        reason: `${reportType}: ${reportReason.trim()}`,
        message_id: reportMessageId,
      }),
    })
    const data = await res.json()
    if (data.error) {
      alert(data.error)
      return
    }
    setModal(null)
    setReportMessageId(null)
    setReportMessagePreview('')
    setReportType('')
    setReportReason('')
    alert('Report submitted')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-zinc-400">Loading chat...</p>
      </div>
    )
  }

  if (blocked) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <p className="text-lg mb-4">Chat unavailable with this user.</p>
          <button
            onClick={() => router.push('/search')}
            className="bg-cyan-500 text-black font-medium px-6 py-3 rounded-xl"
          >
            Back to Search
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[100dvh] bg-black text-white flex flex-col overflow-hidden">
      <div className="bg-black/90 backdrop-blur-md border-b border-white/10 shrink-0 px-3 py-2.5">
        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-zinc-400 leading-none mb-1">
              Chatting with
            </p>
            <p className="text-xl font-bold text-cyan-400 truncate leading-tight mb-1">
              {targetUser?.avatar_icon || '🎭'} {targetUsername}
            </p>
            <p className="text-sm text-zinc-400 leading-snug mb-2">
              No last seen · No read receipts · Text encrypted
            </p>
            <p className="text-sm text-zinc-400 mb-1.5">
              Chat length (from first message)
            </p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.minutes}
                  type="button"
                  disabled={savingDuration}
                  onClick={() => pickMyDuration(opt.minutes)}
                  className={`h-9 min-w-[2.75rem] px-2.5 rounded-lg text-sm font-bold border ${
                    myDuration === opt.minutes
                      ? 'bg-cyan-500 text-black border-cyan-300'
                      : 'bg-zinc-900 text-zinc-300 border-zinc-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              <span className="w-px h-5 bg-zinc-600 mx-0.5" />
              <button
                onClick={() => setModal('clear')}
                className="h-9 px-3 rounded-lg text-sm font-semibold bg-orange-600 text-white"
              >
                Clear
              </button>
              <button
                onClick={() => {
                  setReportMessageId(null)
                  setReportMessagePreview('')
                  setReportType('')
                  setReportReason('')
                  setModal('report')
                }}
                className="h-9 px-3 rounded-lg text-sm font-semibold bg-yellow-600 text-white"
              >
                Report
              </button>
              <button
                onClick={() => setModal('block')}
                className="h-9 px-3 rounded-lg text-sm font-semibold bg-red-600 text-white"
              >
                Block
              </button>
            </div>
          </div>

          <div className="shrink-0 flex flex-col items-end gap-1.5">
            <div className="flex gap-1">
              <span className="text-xs px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300">
                {fileCount}/4 files
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300">
                {videoCount}/1 video
              </span>
            </div>
            <button
              type="button"
              onClick={() => setHeaderOpen((v) => !v)}
              className="h-9 px-3 rounded-xl bg-zinc-800 border border-zinc-600 text-sm font-semibold text-zinc-200"
            >
              {headerOpen ? '▲ Less' : '▼ More'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/search')}
              className="h-10 px-4 rounded-xl bg-zinc-800 border-2 border-cyan-400 text-cyan-300 font-bold text-sm"
            >
              ← Back
            </button>
          </div>
        </div>

        {headerOpen && (
          <div className="flex gap-2 mt-2.5 pt-2.5 border-t border-white/10">
            <button
              type="button"
              onClick={requestSealToggle}
              disabled={savingSeal}
              className={`flex-1 h-10 rounded-xl text-sm font-bold border ${
                mySealOn
                  ? 'bg-cyan-500 text-black border-cyan-300'
                  : 'bg-zinc-800 text-cyan-300 border-cyan-500/40'
              }`}
            >
              {mySealOn ? 'SEAL ON' : 'SEAL'}
            </button>
            <button
              type="button"
              onClick={requestQuietToggle}
              disabled={savingQuiet}
              className={`flex-1 h-10 rounded-xl text-sm font-bold border ${
                myQuietOn
                  ? 'bg-violet-500 text-white border-violet-300'
                  : 'bg-zinc-800 text-violet-300 border-violet-500/40'
              }`}
            >
              {myQuietOn ? 'QUIET ON' : 'QUIET'}
            </button>
            <button
              type="button"
              onClick={() => setModal('ghost')}
              className={`flex-1 h-10 rounded-xl text-sm font-bold border ${
                ghostReply
                  ? 'bg-emerald-500 text-black border-emerald-300'
                  : 'bg-zinc-800 text-emerald-300 border-emerald-500/40'
              }`}
            >
              {ghostReply ? 'GHOST ON' : 'GHOST'}
            </button>
          </div>
        )}
      </div>

      {warningText && (
        <div className="px-3 py-2 bg-amber-500/20 border-b border-amber-500/30 text-amber-200 text-sm shrink-0">
          {warningText}
        </div>
      )}

      {/* MESSAGE WALL — empty text centered */}
      <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0 flex flex-col">
        {messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center px-4">
            <p className="text-center text-zinc-500 text-sm leading-relaxed max-w-xs">
              {chatExpired || sealed
                ? 'This chat has ended.'
                : 'Nothing here yet. When you speak, it can vanish.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => {
              const mine = msg.sender_id === user?.id
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
                        ? 'bg-cyan-600 text-white rounded-br-md'
                        : 'bg-zinc-800 text-zinc-100 rounded-bl-md'
                    }`}
                  >
                    {msg.type === 'image' && (
                      <div>
                        <img
                          src={msg.content}
                          alt=""
                          className="max-w-full rounded-lg mb-1"
                        />
                        <a
                          href={msg.content}
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
                          src={msg.content}
                          controls
                          className="max-w-full rounded-lg mb-1"
                        />
                        <a
                          href={msg.content}
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
                        href={msg.content}
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
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {(chatExpired || sealed) && messages.length === 0 && (
        <div className="shrink-0 p-4 border-t border-zinc-800 bg-zinc-950">
          <p className="text-center text-zinc-400 text-sm mb-3">Chat ended.</p>
          {canStartNewChat() ? (
            <button
              onClick={requestNewChat}
              disabled={startingNew}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-3 rounded-xl disabled:opacity-50"
            >
              {startingNew ? 'Please wait...' : 'Start a new chat'}
            </button>
          ) : (
            <p className="text-center text-zinc-500 text-sm">
              This chat cannot be reopened.
            </p>
          )}
        </div>
      )}

      {!chatExpired && !sealed && (
        <div className="shrink-0 bg-zinc-950 border-t border-zinc-800 p-2">
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => mediaInputRef.current?.click()}
              className="shrink-0 h-11 w-11 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xl"
              title="Photo / Video"
            >
              📷
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 h-11 w-11 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xl"
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
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              placeholder="Type a message..."
              rows={1}
              className="flex-1 min-w-0 p-2.5 rounded-xl bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-cyan-400 text-[15px] resize-none overflow-hidden"
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-3xl p-6">
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
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-2">Clear this chat?</h3>
            <p className="text-sm text-zinc-400 mb-4">
              Messages vanish for both of you right away.
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
                className="flex-1 bg-orange-600 py-2.5 rounded-xl font-medium"
              >
                Clear chat
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'block' && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-2">
              Block {targetUsername}?
            </h3>
            <p className="text-sm text-zinc-400 mb-4">
              They will not find you in search or chat with you.
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
                className="flex-1 bg-red-600 py-2.5 rounded-xl font-medium"
              >
                Block
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'report' && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto">
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
                      : 'bg-zinc-800 border-zinc-600 text-zinc-300'
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
          </div>
        </div>
      )}

      {modal === 'ghost' && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-2">Ghost mode</h3>
            <p className="text-sm text-zinc-400 mb-4">
              After your next message is sent, you go offline. Others cannot find
              you in Search until you turn offline off in Profile.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setModal(null)}
                className="flex-1 bg-zinc-700 py-2.5 rounded-xl"
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
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 w-full max-w-sm">
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
                className="flex-1 bg-zinc-700 py-2.5 rounded-xl"
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
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 w-full max-w-sm">
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
                className="flex-1 bg-zinc-700 py-2.5 rounded-xl"
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
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4 w-full max-w-sm">
            {msgMenu === 'menu' && (
              <>
                <p className="text-sm text-zinc-400 mb-3 line-clamp-2">
                  {activeMsg.type === 'text'
                    ? activeMsg.content
                    : `[${activeMsg.type}]`}
                </p>
                {activeMsg.sender_id === user?.id && activeMsg.type === 'text' && (
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
                  className="w-full p-3 mb-3 rounded-xl bg-zinc-800 border border-zinc-700 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setMsgMenu('menu')}
                    className="flex-1 bg-zinc-700 py-2.5 rounded-xl"
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