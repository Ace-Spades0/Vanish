'use client'
//force vercel rebuild — duration both users + media UI
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
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hour' },
  { minutes: 180, label: '3 hours' },
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

async function decryptMessageRow(convId: string, row: any) {
  if (!row || row.type !== 'text' || !row.content) return row
  if (!looksEncrypted(row.content) && !row.is_encrypted) return row
  try {
    const plain = await decryptText(convId, row.content)
    return { ...row, content: plain, _decrypted: true }
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
  const [modal, setModal] = useState<
    'clear' | 'block' | 'report' | 'safety' | null
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

  const [sealUserIds, setSealUserIds] = useState<string[]>([])
  const [quietUserIds, setQuietUserIds] = useState<string[]>([])
  const [savingSeal, setSavingSeal] = useState(false)
  const [savingQuiet, setSavingQuiet] = useState(false)
  const [sealConfirm, setSealConfirm] = useState<'on' | 'off' | null>(null)
  const [quietConfirm, setQuietConfirm] = useState<'on' | 'off' | null>(null)

  const [durationMinutes, setDurationMinutes] = useState(180)
  const [durationLocked, setDurationLocked] = useState(false)
  const [savingDuration, setSavingDuration] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<any>(null)
  const profileChannelRef = useRef<any>(null)
  const settingsChannelRef = useRef<any>(null)
  const hadMessagesRef = useRef(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const mySealOn = !!(user?.id && sealUserIds.includes(user.id))
  const myQuietOn = !!(user?.id && quietUserIds.includes(user.id))

  const getConversationEnd = (firstCreatedAt: string, minutes: number) => {
    return new Date(
      new Date(firstCreatedAt).getTime() + minutes * 60 * 1000
    ).toISOString()
  }

  const durationLabel = () => {
    const opt = DURATION_OPTIONS.find((o) => o.minutes === durationMinutes)
    return opt?.label || '3 hours'
  }

  const recountMedia = (list: any[]) => {
    setFileCount(list.filter((m) => m.type === 'file' || m.type === 'image').length)
    setVideoCount(list.filter((m) => m.type === 'video').length)
  }

  const canStartNewChat = () => {
    if (!user?.id || !targetUser?.id) return true
    return !sealUserIds.includes(targetUser.id)
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

      const myUsername = myProfile!.username
      const convId = [myUsername, targetProfile.username].sort().join('_')
      setConversationId(convId)

      const { data: settings } = await supabase
        .from('conversation_settings')
        .select('duration_minutes, seal_user_ids, quiet_user_ids, sealed_by')
        .eq('conversation_id', convId)
        .maybeSingle()

      const mins = settings?.duration_minutes || 180
      setDurationMinutes(mins)

      let seals = asIdList(settings?.seal_user_ids)
      if (seals.length === 0 && settings?.sealed_by) {
        seals = [settings.sealed_by]
      }
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
        setDurationLocked(true)
        const endsAt = getConversationEnd(firstCreatedAt, mins)
        setChatEndsAt(endsAt)
        if (new Date(endsAt).getTime() <= Date.now()) {
          await supabase
            .from('messages')
            .update({ deleted: true })
            .eq('conversation_id', convId)
          setMessages([])
          setFileCount(0)
          setVideoCount(0)
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
        setDurationLocked(false)
        setChatEndsAt(null)
        setMessages([])
        setFileCount(0)
        setVideoCount(0)
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
          setDurationLocked(true)
          setSealed(false)
          setChatExpired(false)
          const row = await decryptMessageRow(convId, payload.new)
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev
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
              if (hadMessagesRef.current && next.length === 0) {
                setSealed(true)
                setDurationLocked(false)
              }
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
            if (typeof row.duration_minutes === 'number') {
              setDurationMinutes(row.duration_minutes)
            }
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
      if (settingsChannelRef.current) supabase.removeChannel(settingsChannelRef.current)
      if (longPressTimer.current) clearTimeout(longPressTimer.current)
    }
  }, [targetUsername])

  const saveSettings = async (patch: {
    seal_user_ids?: string[]
    quiet_user_ids?: string[]
    duration_minutes?: number
    duration_set_by?: string
  }) => {
    const { error } = await supabase.from('conversation_settings').upsert(
      {
        conversation_id: conversationId,
        updated_at: new Date().toISOString(),
        duration_minutes: patch.duration_minutes ?? durationMinutes,
        seal_user_ids: patch.seal_user_ids ?? sealUserIds,
        quiet_user_ids: patch.quiet_user_ids ?? quietUserIds,
        ...(patch.duration_set_by
          ? { duration_set_by: patch.duration_set_by }
          : {}),
      },
      { onConflict: 'conversation_id' }
    )
    return error
  }

  const pickDuration = async (minutes: number) => {
    if (!user || !conversationId || durationLocked || savingDuration) return
    if (messages.length > 0) return
    setSavingDuration(true)
    const error = await saveSettings({
      duration_minutes: minutes,
      duration_set_by: user.id,
    })
    if (error) {
      alert(error.message)
      setSavingDuration(false)
      return
    }
    setDurationMinutes(minutes)
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
    } else {
      next = next.filter((id) => id !== user.id)
    }
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
    } else {
      next = next.filter((id) => id !== user.id)
    }
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
    if (!conversationId || startingNew) return
    if (!canStartNewChat()) return
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
    await supabase.from('audit_logs').insert({
      conversation_id: conversationId,
      payload: {
        action: 'start_new_chat',
        by: user?.id,
        at: new Date().toISOString(),
        target_username: targetUsername,
      },
    })
    setMessages([])
    setFileCount(0)
    setVideoCount(0)
    setChatEndsAt(null)
    setChatExpired(false)
    setSealed(false)
    setDurationLocked(false)
    setWarningLevel(0)
    setWarningText('')
    setNewMessage('')
    hadMessagesRef.current = false
    setStartingNew(false)
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
    if (chatEndsAt) return chatEndsAt
    const { data: firstRows } = await supabase
      .from('messages')
      .select('created_at')
      .eq('conversation_id', conversationId)
      .eq('deleted', false)
      .order('created_at', { ascending: true })
      .limit(1)
    if (firstRows?.[0]?.created_at) {
      const endsAt = getConversationEnd(firstRows[0].created_at, durationMinutes)
      setChatEndsAt(endsAt)
      return endsAt
    }
    const endsAt = new Date(
      Date.now() + durationMinutes * 60 * 1000
    ).toISOString()
    setChatEndsAt(endsAt)
    return endsAt
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !conversationId || chatExpired || sealed)
      return
    const content = newMessage.trim()
    setNewMessage('')

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
          myQuietOn
            ? nextLevel === 1
              ? 'Quiet mode: you are asking a lot. Please slow down.'
              : 'Quiet mode final warning: continued questioning may shorten this chat.'
            : nextLevel === 1
              ? 'You are asking a lot of questions. Please slow down.'
              : 'Final warning: continued questioning may shorten this chat.'
        )
        useShortExpiry = false
      } else {
        useShortExpiry = true
        setWarningText(
          'Anti-interrogation limit applied. New messages may expire in 30 minutes.'
        )
      }
    }

    if (!durationLocked) {
      await saveSettings({
        duration_minutes: durationMinutes,
        duration_set_by: user.id,
      })
    }

    const expiresAt = await resolveExpiresAt(useShortExpiry)
    if (new Date(expiresAt).getTime() <= Date.now()) {
      setChatExpired(true)
      setSealed(true)
      alert(`This chat has ended (${durationLabel()} from the first message).`)
      return
    }

    let payload = content
    try {
      payload = await encryptText(conversationId, content)
    } catch {
      alert('Could not encrypt message')
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
    setDurationLocked(true)
    setSealed(false)
    setChatExpired(false)

    if (ghostReply) {
      await supabase
        .from('profiles')
        .update({ is_offline: true })
        .eq('id', user.id)
      setGhostReply(false)
      alert('Ghost reply on. You are now offline in Search.')
    }
  }

  const uploadFile = async (e: any) => {
    const file = e.target.files?.[0]
    if (!file || !user || !conversationId || chatExpired || sealed) return
    const isVideo = file.type.startsWith('video/')
    const isImage = file.type.startsWith('image/')

    if (isVideo) {
      if (videoCount >= 1) {
        alert('Only 1 video allowed in this chat')
        return
      }
      if (file.size > 30 * 1024 * 1024) {
        alert('Video must be smaller than 30 MB')
        return
      }
    } else {
      if (fileCount >= 4) {
        alert('Maximum 4 files / photos allowed')
        return
      }
      if (file.size > 15 * 1024 * 1024) {
        alert('File must be smaller than 15 MB')
        return
      }
    }

    if (!durationLocked) {
      await saveSettings({
        duration_minutes: durationMinutes,
        duration_set_by: user.id,
      })
    }

    const expiresAt = await resolveExpiresAt(false)
    if (new Date(expiresAt).getTime() <= Date.now()) {
      setChatExpired(true)
      setSealed(true)
      alert(`This chat has ended (${durationLabel()} from the first message).`)
      return
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const fileName = `${conversationId}/${Date.now()}-${safeName}`
    const { error } = await supabase.storage
      .from('chat-photos')
      .upload(fileName, file)
    if (error) {
      alert('Failed to upload file')
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
    setDurationLocked(true)
    setSealed(false)
    setChatExpired(false)
    e.target.value = ''
  }
    const openMsgMenu = (msg: any) => {
    if (!user || msg.sender_id !== user.id) return
    if (msg.type !== 'text') return
    setActiveMsg(msg)
    setEditText(msg.content || '')
    setMsgMenu('menu')
  }

  const startLongPress = (msg: any) => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressTimer.current = setTimeout(() => {
      setReportMessageId(msg.id)
      setReportMessagePreview(
        msg.type === 'text'
          ? (msg.content || '').slice(0, 120)
          : `[${msg.type}]`
      )
      setReportType('')
      setReportReason('')
      setModal('report')
    }, 550)
  }

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const vanishOneMessage = async () => {
    if (!activeMsg) return
    const { error } = await supabase
      .from('messages')
      .update({ deleted: true })
      .eq('id', activeMsg.id)
    if (error) {
      alert(error.message)
      return
    }
    setMsgMenu(null)
    setActiveMsg(null)
  }

  const saveEditMessage = async () => {
    if (!activeMsg || !editText.trim() || !conversationId) return
    let payload = editText.trim()
    try {
      payload = await encryptText(conversationId, editText.trim())
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

  const confirmClearChat = async () => {
    if (!conversationId || !user) return
    await supabase
      .from('messages')
      .update({ deleted: true })
      .eq('conversation_id', conversationId)
    await supabase.from('audit_logs').insert({
      conversation_id: conversationId,
      payload: {
        action: 'clear_chat',
        by: user.id,
        at: new Date().toISOString(),
      },
    })
    setMessages([])
    setFileCount(0)
    setVideoCount(0)
    setSealed(true)
    setDurationLocked(false)
    setModal(null)
  }

  const confirmBlockUser = async () => {
    if (!user || !targetUser) return
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch('/api/block', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ blocked_id: targetUser.id }),
    })
    const data = await res.json()
    if (!res.ok) {
      alert(data.error || 'Block failed')
      return
    }
    setModal(null)
    setBlocked(true)
  }

  const confirmReportUser = async () => {
    if (!user || !targetUser || !reportType || !reportReason.trim()) {
      alert('Choose a type and explain')
      return
    }
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch('/api/report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        reported_id: targetUser.id,
        conversation_id: conversationId,
        reason: `${reportType}: ${reportReason.trim()}`,
        message_id: reportMessageId,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      alert(data.error || 'Report failed')
      return
    }
    setModal(null)
    setReportMessageId(null)
    setReportType('')
    setReportReason('')
    alert('Report submitted')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (blocked) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6 text-center">
        <p className="text-zinc-400 mb-4">Chat unavailable</p>
        <button
          onClick={() => router.push('/search')}
          className="bg-cyan-500 text-black px-6 py-3 rounded-xl font-medium"
        >
          Back to Search
        </button>
      </div>
    )
  }

  if (chatExpired || (sealed && messages.length === 0 && hadMessagesRef.current)) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6 text-center">
        <p className="text-xl font-semibold mb-2">This chat has vanished</p>
        <p className="text-zinc-500 text-sm mb-6">
          {chatExpired
            ? `Time ended (${durationLabel()} from first message).`
            : 'Chat was cleared.'}
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          {canStartNewChat() && (
            <button
              onClick={requestNewChat}
              disabled={startingNew}
              className="w-full bg-cyan-500 text-black font-medium py-3 rounded-xl disabled:opacity-50"
            >
              {startingNew ? '…' : 'Start new chat'}
            </button>
          )}
          <button
            onClick={() => router.push('/search')}
            className="w-full bg-zinc-800 border border-zinc-700 py-3 rounded-xl"
          >
            Back to Search
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#05070c] text-white flex flex-col h-[100dvh] relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-cyan-500/10 blur-[100px] rounded-full" />
      </div>

      <div className="relative z-10 bg-black/55 backdrop-blur-md px-3 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-zinc-400">Chatting with</p>
            <h1 className="text-lg sm:text-xl font-bold text-cyan-400 truncate leading-tight">
              {targetUsername}
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
              No last seen · No read receipts · Text encrypted
            </p>
          </div>
          <div className="flex gap-1.5 shrink-0 pt-1">
            <span className="text-[11px] text-zinc-300 bg-zinc-800 px-2 py-1 rounded-lg">
              {fileCount}/4 files
            </span>
            <span className="text-[11px] text-zinc-300 bg-zinc-800 px-2 py-1 rounded-lg">
              {videoCount}/1 video
            </span>
          </div>
        </div>

        {/* Both users always see chat length */}
        <div className="mb-2 p-2 rounded-xl bg-zinc-900/90 border border-zinc-700">
          <p className="text-[11px] text-zinc-400 mb-1">
            Chat length (from first message) · both of you can see this
          </p>
          {messages.length === 0 && !durationLocked ? (
            <div className="flex gap-2">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.minutes}
                  type="button"
                  disabled={savingDuration}
                  onClick={() => pickDuration(opt.minutes)}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition ${
                    durationMinutes === opt.minutes
                      ? 'bg-cyan-500 text-black border-cyan-300'
                      : 'bg-zinc-800 text-zinc-300 border-zinc-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm font-medium text-cyan-300">{durationLabel()}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-2">
          <button
            type="button"
            onClick={requestSealToggle}
            disabled={savingSeal}
            className={`flex-1 min-w-[90px] py-2.5 px-2 rounded-xl text-sm font-bold border transition text-center ${
              mySealOn
                ? 'bg-cyan-500 text-black border-cyan-300'
                : 'bg-zinc-800/90 text-cyan-300 border-cyan-500/40'
            }`}
          >
            {savingSeal ? '…' : mySealOn ? 'SEAL ON' : 'SEAL'}
          </button>
          <button
            type="button"
            onClick={requestQuietToggle}
            disabled={savingQuiet}
            className={`flex-1 min-w-[90px] py-2.5 px-2 rounded-xl text-sm font-bold border transition text-center ${
              myQuietOn
                ? 'bg-violet-500 text-white border-violet-300'
                : 'bg-zinc-800 text-violet-300 border-violet-500/40'
            }`}
          >
            {savingQuiet ? '…' : myQuietOn ? 'QUIET ON' : 'QUIET'}
          </button>
          <button
            type="button"
            onClick={() => setGhostReply(!ghostReply)}
            className={`flex-1 min-w-[90px] py-2.5 px-2 rounded-xl text-sm font-bold border transition text-center ${
              ghostReply
                ? 'bg-emerald-500 text-black border-emerald-300'
                : 'bg-zinc-800 text-emerald-300 border-emerald-500/40'
            }`}
          >
            {ghostReply ? 'GHOST ON' : 'GHOST'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setModal('clear')}
            className="text-xs font-medium bg-orange-600 hover:bg-orange-500 px-3 py-2.5 rounded-xl"
          >
            Clear chat
          </button>
          <button
            onClick={() => {
              setReportMessageId(null)
              setReportMessagePreview('')
              setReportType('')
              setReportReason('')
              setModal('report')
            }}
            className="text-xs font-medium bg-yellow-600 hover:bg-yellow-500 px-3 py-2.5 rounded-xl"
          >
            Report
          </button>
          <button
            onClick={() => setModal('block')}
            className="text-xs font-medium bg-red-600 hover:bg-red-500 px-3 py-2.5 rounded-xl"
          >
            Block
          </button>
          <button
            onClick={() => router.push('/home')}
            className="text-xs font-medium bg-zinc-700 hover:bg-zinc-600 px-3 py-2.5 rounded-xl"
          >
            Back
          </button>
        </div>
      </div>

      {warningText && (
        <div className="relative z-10 bg-yellow-500/15 border-b border-yellow-600/40 px-3 py-2 text-sm text-yellow-200 text-center">
          {warningText}
        </div>
      )}

      <div className="relative z-10 flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center pt-10">
            <div className="text-3xl mb-2 opacity-40">💬</div>
            <p className="text-zinc-400 text-sm">No messages yet</p>
            <p className="text-zinc-600 text-xs mt-1">
              Timer starts at first message · {durationLabel()}
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const mine = msg.sender_id === user?.id
            return (
              <div
                key={msg.id}
                className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
              >
                <button
                  type="button"
                  onClick={() => openMsgMenu(msg)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setReportMessageId(msg.id)
                    setReportMessagePreview(
                      msg.type === 'text'
                        ? (msg.content || '').slice(0, 120)
                        : `[${msg.type}]`
                    )
                    setReportType('')
                    setReportReason('')
                    setModal('report')
                  }}
                  onTouchStart={() => startLongPress(msg)}
                  onTouchEnd={cancelLongPress}
                  onTouchMove={cancelLongPress}
                  onMouseDown={() => startLongPress(msg)}
                  onMouseUp={cancelLongPress}
                  onMouseLeave={cancelLongPress}
                  className={`max-w-[82%] text-left transition relative select-none ${
                    msg.type === 'text'
                      ? mine
                        ? 'px-3 py-2 bg-gradient-to-br from-cyan-300 via-cyan-400 to-cyan-600 text-black rounded-2xl rounded-br-sm'
                        : 'px-3 py-2 bg-zinc-900/80 text-zinc-100 rounded-2xl rounded-bl-sm'
                      : 'p-0 bg-transparent'
                  }`}
                >
                  {msg.type === 'image' && (
                    <div className="space-y-1 max-w-[240px]">
                      <img
                        src={msg.content}
                        alt=""
                        className="rounded-lg max-h-52 w-auto object-cover block"
                      />
                      <a
                        href={msg.content}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block text-xs font-semibold text-cyan-300 underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Download photo
                      </a>
                    </div>
                  )}
                  {msg.type === 'video' && (
                    <div className="space-y-1 max-w-[260px]" onClick={(e) => e.stopPropagation()}>
                      <video
                        src={msg.content}
                        controls
                        className="rounded-lg max-h-52 w-full"
                      />
                      <a
                        href={msg.content}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block text-xs font-semibold text-cyan-300 underline"
                      >
                        Download video
                      </a>
                    </div>
                  )}
                  {msg.type === 'file' && (
                    <div className="space-y-1 px-1">
                      <p className="text-sm text-zinc-200">📎 File</p>
                      <a
                        href={msg.content}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block text-xs font-semibold text-cyan-300 underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Download file
                      </a>
                    </div>
                  )}
                  {msg.type === 'text' && (
                    <p className="text-[16px] sm:text-[17px] leading-relaxed whitespace-pre-wrap break-words">
                      {msg.content}
                    </p>
                  )}
                </button>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="relative z-10 bg-black/55 backdrop-blur-md px-3 py-2 border-t border-white/10 shrink-0">
        <div className="flex gap-2 items-end">
          <label className="cursor-pointer shrink-0 h-[42px] px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 flex items-center gap-1.5">
            <span className="text-cyan-400 text-lg font-bold leading-none">＋</span>
            <span className="text-[10px] text-zinc-300 hidden sm:inline">File</span>
            <input
              type="file"
              accept="image/*,video/*,.pdf,.doc,.docx,.txt,.zip,.ppt,.pptx,.xls,.xlsx"
              onChange={uploadFile}
              className="hidden"
            />
          </label>
          <textarea
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            rows={2}
            className="flex-1 min-w-0 p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-700 focus:outline-none focus:border-cyan-400 text-[15px] resize-none"
          />
          <button
            onClick={sendMessage}
            className="bg-cyan-500 hover:bg-cyan-400 text-black font-medium px-4 py-2.5 rounded-xl text-sm"
          >
            Send
          </button>
        </div>
        <p className="text-[10px] text-zinc-500 mt-1 px-1">
          Photo, video, PDF, Word, ZIP, PowerPoint · 4 files · 1 video
        </p>
      </div>

      {sealConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-cyan-500/40 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-2">
              {sealConfirm === 'on' ? 'Seal this chat?' : 'Turn Seal off?'}
            </h3>
            <p className="text-sm text-zinc-400 mb-5 leading-relaxed">
              {sealConfirm === 'on'
                ? 'When the chat ends, the other person cannot start a new chat with you here. They are not told you turned Seal on.'
                : 'You remove your Seal. Their Seal is separate.'}
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
                className={`flex-1 py-2.5 rounded-xl font-semibold ${
                  sealConfirm === 'on' ? 'bg-cyan-500 text-black' : 'bg-zinc-500 text-white'
                }`}
              >
                {sealConfirm === 'on' ? 'Turn Seal on' : 'Turn Seal off'}
              </button>
            </div>
          </div>
        </div>
      )}

      {quietConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-violet-500/40 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-2">
              {quietConfirm === 'on' ? 'Turn Quiet mode on?' : 'Turn Quiet mode off?'}
            </h3>
            <p className="text-sm text-zinc-400 mb-5 leading-relaxed">
              {quietConfirm === 'on'
                ? 'Quiet applies only to you. The other person is not notified.'
                : 'Your anti-interrogation returns to normal.'}
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
                className={`flex-1 py-2.5 rounded-xl font-semibold ${
                  quietConfirm === 'on' ? 'bg-violet-500 text-white' : 'bg-zinc-500 text-white'
                }`}
              >
                {quietConfirm === 'on' ? 'Turn Quiet on' : 'Turn Quiet off'}
              </button>
            </div>
          </div>
        </div>
      )}

      {msgMenu && activeMsg && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 w-full max-w-sm">
            {msgMenu === 'menu' && (
              <>
                <h3 className="text-lg font-semibold mb-4">Message</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => setMsgMenu('edit')}
                    className="w-full bg-cyan-600 hover:bg-cyan-500 py-2.5 rounded-xl"
                  >
                    Edit
                  </button>
                  <button
                    onClick={vanishOneMessage}
                    className="w-full bg-red-600 hover:bg-red-500 py-2.5 rounded-xl"
                  >
                    Vanish this message
                  </button>
                  <button
                    onClick={() => {
                      setMsgMenu(null)
                      setActiveMsg(null)
                    }}
                    className="w-full bg-zinc-700 py-2.5 rounded-xl"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
            {msgMenu === 'edit' && (
              <>
                <h3 className="text-lg font-semibold mb-3">Edit message</h3>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={3}
                  className="w-full p-3 mb-4 rounded-xl bg-zinc-800 border border-zinc-700 text-[15px] resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setMsgMenu('menu')}
                    className="flex-1 bg-zinc-700 py-2 rounded-xl"
                  >
                    Back
                  </button>
                  <button
                    onClick={saveEditMessage}
                    className="flex-1 bg-cyan-500 text-black py-2 rounded-xl"
                  >
                    Save
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto">
            {modal === 'safety' && (
              <>
                <h3 className="text-lg font-semibold mb-2">Stay safe on Go Vanish</h3>
                <ul className="text-sm text-zinc-400 space-y-2 mb-4 list-disc pl-4">
                  <li>Never share passwords, codes, or payment details.</li>
                  <li>You can Clear chat, Block, or leave anytime.</li>
                  <li>Hold a message to report it.</li>
                  <li>Text is encrypted on device before storage.</li>
                </ul>
                <p className="text-xs sm:text-sm font-semibold text-cyan-300/95 mb-5 leading-relaxed uppercase tracking-wide">
                  NO ONLINE SERVICE CAN GUARANTEE PERFECT SECURITY. DO NOT SHARE
                  SECRETS YOU CANNOT AFFORD TO EXPOSE.
                </p>
                <button
                  onClick={acceptSafety}
                  className="w-full bg-cyan-500 text-black font-medium py-3 rounded-xl"
                >
                  I understand
                </button>
              </>
            )}
            {modal === 'clear' && (
              <>
                <h3 className="text-lg font-semibold mb-2">Clear chat?</h3>
                <p className="text-zinc-400 text-sm mb-5">
                  Messages disappear for both of you.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setModal(null)}
                    className="flex-1 bg-zinc-700 py-2.5 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmClearChat}
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
                <p className="text-zinc-400 text-sm mb-5">
                  Blocks the account. No chat or letters either way.
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
                <h3 className="text-lg font-semibold mb-1">
                  Report {targetUsername}
                </h3>
                {reportMessageId && (
                  <p className="text-xs text-zinc-500 mb-3 break-words">
                    About message: “{reportMessagePreview}”
                  </p>
                )}
                <p className="text-xs text-zinc-400 mb-2">Type of report</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {REPORT_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setReportType(type)}
                      className={`text-xs px-2.5 py-1.5 rounded-full border ${
                        reportType === type
                          ? 'bg-yellow-500 text-black border-yellow-400'
                          : 'border-zinc-600 text-zinc-300'
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
          </div>
        </div>
      )}
    </div>
  )
}