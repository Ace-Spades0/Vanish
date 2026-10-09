'use client'

//force vercel rebuild
import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
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

export default function ChatPage() {
  const params = useParams()
  const targetUsername = params.username as string
  const router = useRouter()

  const [user, setUser] = useState<any>(null)
  const [targetUser, setTargetUser] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [conversationId, setConversationId] = useState('')
  const [fileCount, setFileCount] = useState(0)
  const [videoCount, setVideoCount] = useState(0)
  const [blocked, setBlocked] = useState(false)
  const [chatExpired, setChatExpired] = useState(false)
  const [chatEndsAt, setChatEndsAt] = useState<string | null>(null)
  const [modal, setModal] = useState<'clear' | 'block' | 'report' | null>(null)
  const [reportReason, setReportReason] = useState('')
  const [warningLevel, setWarningLevel] = useState(0)
  const [warningText, setWarningText] = useState('')
  const [activeMsg, setActiveMsg] = useState<any>(null)
  const [editText, setEditText] = useState('')
  const [msgMenu, setMsgMenu] = useState<'menu' | 'edit' | null>(null)
  const [ghostReply, setGhostReply] = useState(false)
  const [sealed, setSealed] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<any>(null)
  const hadMessagesRef = useRef(false)

  const getConversationEnd = (firstCreatedAt: string) => {
    return new Date(
      new Date(firstCreatedAt).getTime() + 3 * 60 * 60 * 1000
    ).toISOString()
  }

  const recountMedia = (list: any[]) => {
    setFileCount(list.filter((m) => m.type === 'file' || m.type === 'image').length)
    setVideoCount(list.filter((m) => m.type === 'video').length)
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
        .select('username, username_claimed_at, is_permanent_username, status')
        .eq('id', user.id)
        .maybeSingle()

      if (myProfile?.status === 'suspended' || myProfile?.status === 'banned') {
        await supabase.auth.signOut()
        router.push('/auth')
        return
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

      const { data: firstRows } = await supabase
        .from('messages')
        .select('created_at')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true })
        .limit(1)

      const firstCreatedAt = firstRows?.[0]?.created_at || null

      if (firstCreatedAt) {
        const endsAt = getConversationEnd(firstCreatedAt)
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
      }

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

      if (existingMessages && isMounted) {
        setMessages(existingMessages)
        recountMedia(existingMessages)
        if (existingMessages.length > 0) {
          hadMessagesRef.current = true
        }
      }

      if (!isMounted) return
      setLoading(false)

      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }

      const channel = supabase.channel(`chat-${convId}`)

      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${convId}`,
        },
        (payload) => {
          if (payload.new.deleted) return
          hadMessagesRef.current = true
          setSealed(false)
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) return prev
            const next = [...prev, payload.new]
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
        (payload) => {
          const row = payload.new as any

          if (row.deleted) {
            setMessages((prev) => {
              const next = prev.filter((m) => m.id !== row.id)
              recountMedia(next)
              if (hadMessagesRef.current && next.length === 0) {
                setSealed(true)
              }
              return next
            })
            return
          }

          setMessages((prev) =>
            prev.map((m) => (m.id === row.id ? { ...m, ...row } : m))
          )
        }
      )

      channel.subscribe()
      channelRef.current = channel
    }

    init()
    return () => {
      isMounted = false
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [targetUsername])

  const resolveExpiresAt = async (forceShort: boolean) => {
    if (forceShort) {
      return new Date(Date.now() + 30 * 60 * 1000).toISOString()
    }
    if (chatEndsAt) return chatEndsAt

    const { data: firstRows } = await supabase
      .from('messages')
      .select('created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(1)

    if (firstRows?.[0]?.created_at) {
      const endsAt = getConversationEnd(firstRows[0].created_at)
      setChatEndsAt(endsAt)
      return endsAt
    }

    const endsAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
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
    const interrogationDetected = isQuestion && totalQuestions >= 6

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
        setWarningText(
          'Anti-interrogation limit applied. New messages may expire in 30 minutes.'
        )
      }
    }

    const expiresAt = await resolveExpiresAt(useShortExpiry)
    if (new Date(expiresAt).getTime() <= Date.now()) {
      setChatExpired(true)
      setSealed(true)
      alert('This chat has ended (3 hours from the first message).')
      return
    }

    const { error } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content,
      type: 'text',
      expires_at: expiresAt,
    })

    if (error) {
      alert(error.message)
      return
    }

    hadMessagesRef.current = true
    setSealed(false)

    // Ghost reply → go offline after send
    if (ghostReply) {
      await supabase
        .from('profiles')
        .update({ is_offline: true })
        .eq('id', user.id)
      setGhostReply(false)
      alert('Ghost reply on. You are now offline in Search.')
    }

    if (useShortExpiry) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('anti_interrogation_count')
        .eq('id', user.id)
        .maybeSingle()

      const newCount = (profile?.anti_interrogation_count || 0) + 1
      const updateData: any = { anti_interrogation_count: newCount }
      if (newCount > 10) updateData.status = 'suspended'

      await supabase.from('profiles').update(updateData).eq('id', user.id)

      if (newCount > 10) {
        await supabase.auth.signOut()
        alert(
          'Your account has been suspended due to repeated anti-interrogation triggers.'
        )
        router.push('/auth')
      }
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
        alert('Maximum 4 files allowed in this chat')
        return
      }
      if (file.size > 10 * 1024 * 1024) {
        alert('File must be smaller than 10 MB')
        return
      }
    }

    const expiresAt = await resolveExpiresAt(false)
    if (new Date(expiresAt).getTime() <= Date.now()) {
      setChatExpired(true)
      setSealed(true)
      alert('This chat has ended (3 hours from the first message).')
      return
    }

    const fileName = `${conversationId}/${Date.now()}-${file.name}`
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
      expires_at: expiresAt,
    })

    hadMessagesRef.current = true
    setSealed(false)
    e.target.value = ''
  }

  const openMsgMenu = (msg: any) => {
    if (!user || msg.sender_id !== user.id) return
    if (msg.type !== 'text') return
    setActiveMsg(msg)
    setEditText(msg.content || '')
    setMsgMenu('menu')
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

    setMessages((prev) => {
      const next = prev.filter((m) => m.id !== activeMsg.id)
      recountMedia(next)
      if (hadMessagesRef.current && next.length === 0) {
        setSealed(true)
      }
      return next
    })
    setActiveMsg(null)
    setMsgMenu(null)
  }

  const saveEditMessage = async () => {
    if (!activeMsg || !editText.trim()) return

    const { error } = await supabase
      .from('messages')
      .update({ content: editText.trim() })
      .eq('id', activeMsg.id)
      .eq('sender_id', user.id)

    if (error) {
      alert(error.message)
      return
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.id === activeMsg.id ? { ...m, content: editText.trim() } : m
      )
    )
    setActiveMsg(null)
    setMsgMenu(null)
    setEditText('')
  }

  const confirmClearChat = async () => {
    if (!user || !conversationId) return

    const { error } = await supabase
      .from('messages')
      .update({ deleted: true })
      .eq('conversation_id', conversationId)
      .eq('deleted', false)

    if (error) {
      alert(error.message)
      return
    }

    await supabase.from('audit_logs').insert({
      conversation_id: conversationId,
      payload: {
        action: 'clear_chat',
        cleared_by: user.id,
        cleared_at: new Date().toISOString(),
        target_username: targetUsername,
      },
    })

    setMessages([])
    setFileCount(0)
    setVideoCount(0)
    setSealed(true)
    setModal(null)
  }

  const confirmBlockUser = async () => {
    if (!user || !targetUser) return
    const { error } = await supabase.from('blocks').insert({
      blocker_id: user.id,
      blocked_id: targetUser.id,
    })
    if (error) {
      alert(error.message)
      return
    }
    setModal(null)
    setBlocked(true)
  }

  const confirmReportUser = async () => {
    if (!user || !targetUser) {
      alert('Cannot report right now')
      return
    }
    if (!reportReason.trim()) {
      alert('Please enter a reason')
      return
    }

    const { error } = await supabase.from('reports').insert({
      reporter_id: user.id,
      reported_id: targetUser.id,
      reason: `${reportReason.trim()} | chat:${conversationId || 'unknown'}`,
      reviewed: false,
    })

    if (error) {
      alert('Report failed: ' + error.message)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('report_count')
      .eq('id', targetUser.id)
      .maybeSingle()

    const newCount = (profile?.report_count || 0) + 1
    const updateData: any = { report_count: newCount }
    if (newCount >= 5) updateData.status = 'suspended'
    await supabase.from('profiles').update(updateData).eq('id', targetUser.id)

    alert('Report submitted')
    setReportReason('')
    setModal(null)
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
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6 text-center">
        <div className="text-6xl mb-4">🚫</div>
        <h1 className="text-2xl font-bold mb-2">Chat Unavailable</h1>
        <p className="text-zinc-400 mb-6">You cannot chat with this user.</p>
        <button
          onClick={() => router.push('/search')}
          className="bg-zinc-700 hover:bg-zinc-600 px-6 py-3 rounded-xl transition"
        >
          Back to Search
        </button>
      </div>
    )
  }

  // Seal screen (clear or 3-hour end)
  if (chatExpired || sealed) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6 text-center">
        <div className="text-5xl mb-4 text-cyan-400/80">◎</div>
        <h1 className="text-2xl font-bold mb-2">This chat has vanished</h1>
        <p className="text-zinc-400 mb-6 text-sm max-w-xs">
          {chatExpired
            ? 'This conversation ended 3 hours after the first message.'
            : 'The conversation was cleared.'}
        </p>
        <button
          onClick={() => router.push('/search')}
          className="bg-zinc-700 hover:bg-zinc-600 px-6 py-3 rounded-xl transition"
        >
          Back to Search
        </button>
      </div>
    )
  }

  return (
    <div className="h-[100dvh] text-white flex flex-col overflow-hidden relative">
      <div className="pointer-events-none absolute inset-0 bg-[#05070a]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(34,211,238,0.12),_transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(37,99,235,0.10),_transparent_50%)]" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'radial-gradient(circle, rgba(34,211,238,0.9) 1px, transparent 1px)',
            backgroundSize: '18px 18px',
          }}
        />
      </div>

      {/* Header + Trust line */}
      <div className="relative z-10 bg-black/50 backdrop-blur-md px-3 py-2 border-b border-white/10 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] text-zinc-500">Chatting with</p>
            <h1 className="text-sm sm:text-base font-bold text-cyan-400 truncate">
              {targetUsername}
            </h1>
            <p className="text-[10px] text-zinc-500 mt-0.5">
              No last seen · No read receipts
            </p>
          </div>
          <div className="flex items-center gap-1 flex-wrap justify-end">
            <span className="text-[10px] text-zinc-400 bg-zinc-800/80 px-2 py-1 rounded-full">
              {fileCount}/4
            </span>
            <span className="text-[10px] text-zinc-400 bg-zinc-800/80 px-2 py-1 rounded-full">
              {videoCount}/1
            </span>
            <button
              onClick={() => setModal('clear')}
              className="text-[10px] bg-orange-600 hover:bg-orange-500 px-2 py-1 rounded-lg"
            >
              Clear
            </button>
            <button
              onClick={() => setModal('report')}
              className="text-[10px] bg-yellow-600 hover:bg-yellow-500 px-2 py-1 rounded-lg"
            >
              Report
            </button>
            <button
              onClick={() => setModal('block')}
              className="text-[10px] bg-red-600 hover:bg-red-500 px-2 py-1 rounded-lg"
            >
              Block
            </button>
            <button
              onClick={() => router.push('/home')}
              className="text-[10px] bg-zinc-700 hover:bg-zinc-600 px-2 py-1 rounded-lg"
            >
              Back
            </button>
          </div>
        </div>
      </div>

      {warningText && (
        <div className="relative z-10 bg-yellow-500/15 border-b border-yellow-600/40 px-3 py-2 text-xs text-yellow-200 text-center">
          {warningText}
        </div>
      )}

      <div className="relative z-10 flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center pt-10">
            <div className="text-3xl mb-2 opacity-40">💬</div>
            <p className="text-zinc-400 text-sm">No messages yet</p>
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
                  className={`max-w-[82%] px-4 py-2.5 text-left transition relative ${
                    mine
                      ? 'bg-gradient-to-br from-cyan-300 via-cyan-400 to-cyan-600 text-black ' +
                        'rounded-2xl rounded-tr-2xl rounded-bl-2xl rounded-br-sm ' +
                        'shadow-[0_0_24px_rgba(34,211,238,0.22)] ' +
                        'border border-cyan-200/40'
                      : 'bg-zinc-900/70 text-zinc-100 backdrop-blur-md ' +
                        'rounded-2xl rounded-tl-2xl rounded-br-2xl rounded-bl-sm ' +
                        'border border-cyan-500/20 ' +
                        'shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                  }`}
                >
                  {msg.type === 'image' && (
                    <div className="relative">
                      <img
                        src={msg.content}
                        alt="photo"
                        className="rounded-xl max-h-44 object-cover"
                      />
                      <a
                        href={msg.content}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-2 py-1 rounded-lg"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Download
                      </a>
                    </div>
                  )}
                  {msg.type === 'video' && (
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      <video
                        src={msg.content}
                        controls
                        className="rounded-xl max-h-44"
                      />
                    </div>
                  )}
                  {msg.type === 'file' && (
                    <a
                      href={msg.content}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      📄 Download file
                    </a>
                  )}
                  {msg.type === 'text' && (
                    <p className="text-[16px] sm:text-[17px] leading-relaxed whitespace-pre-wrap break-words">
                      {msg.content}
                    </p>
                  )}
                  {mine && (
                    <span className="pointer-events-none absolute -bottom-1 right-2 h-[2px] w-8 rounded-full bg-gradient-to-r from-cyan-300 to-transparent opacity-70" />
                  )}
                </button>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input + Ghost */}
      <div className="relative z-10 bg-black/55 backdrop-blur-md px-3 py-2 border-t border-white/10 shrink-0">
        <div className="flex gap-2 items-end">
          <label className="cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-xl">
            📎
            <input
              type="file"
              accept="image/*,video/*,.pdf,.doc,.docx,.txt,.zip"
              onChange={uploadFile}
              className="hidden"
            />
          </label>
          <button
            type="button"
            onClick={() => setGhostReply(!ghostReply)}
            className={`text-[10px] px-2.5 py-2 rounded-xl border shrink-0 ${
              ghostReply
                ? 'bg-cyan-500 text-black border-cyan-400'
                : 'bg-zinc-800 text-zinc-300 border-zinc-700'
            }`}
            title="After you send, go offline in Search"
          >
            Ghost
          </button>
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
        {ghostReply && (
          <p className="text-[10px] text-cyan-400/90 mt-1.5 px-1">
            Ghost on: after Send, you go offline in Search.
          </p>
        )}
      </div>

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
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 w-full max-w-sm">
            {modal === 'clear' && (
              <>
                <h3 className="text-lg font-semibold mb-2">Clear chat?</h3>
                <p className="text-zinc-400 text-sm mb-5">
                  Messages will disappear for both of you. You will see: This chat
                  has vanished.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setModal(null)}
                    className="flex-1 bg-zinc-700 py-2 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmClearChat}
                    className="flex-1 bg-orange-600 py-2 rounded-xl"
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
                  You will not be able to chat with this user.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setModal(null)}
                    className="flex-1 bg-zinc-700 py-2 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmBlockUser}
                    className="flex-1 bg-red-600 py-2 rounded-xl"
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
                <input
                  type="text"
                  placeholder="Reason..."
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full p-3 mb-4 rounded-xl bg-zinc-800 border border-zinc-700 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setModal(null)}
                    className="flex-1 bg-zinc-700 py-2 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmReportUser}
                    className="flex-1 bg-yellow-600 py-2 rounded-xl"
                  >
                    Report
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