'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

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
  const [modal, setModal] = useState<{
    type: 'clear' | 'block' | 'report' | null
    text?: string
  }>({ type: null })
  const [reportReason, setReportReason] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<any>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    let isMounted = true

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth')
        return
      }
      if (!isMounted) return
      setUser(user)

      const { data: myProfile } = await supabase
        .from('profiles')
        .select('username, username_claimed_at, status')
        .eq('id', user.id)
        .maybeSingle()

      if (myProfile?.status === 'suspended' || myProfile?.status === 'banned') {
        await supabase.auth.signOut()
        router.push('/auth')
        return
      }

      const hasValidUsername =
        myProfile?.username &&
        myProfile.username_claimed_at &&
        (Date.now() - new Date(myProfile.username_claimed_at).getTime()) / (1000 * 60 * 60) < 24

      if (!hasValidUsername) {
        router.push('/username')
        return
      }

      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', targetUsername)
        .maybeSingle()

      if (!targetProfile) {
        setBlocked(true)
        setLoading(false)
        return
      }

      const hoursPassed =
        (Date.now() - new Date(targetProfile.username_claimed_at).getTime()) / (1000 * 60 * 60)

      if (hoursPassed >= 24) {
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

      const myUsername = myProfile.username
      const convId = [myUsername, targetUsername].sort().join('_')
      setConversationId(convId)

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
        setFileCount(existingMessages.filter((m) => m.type === 'file' || m.type === 'image').length)
        setVideoCount(existingMessages.filter((m) => m.type === 'video').length)
      }

      if (!isMounted) return
      setLoading(false)

      if (channelRef.current) supabase.removeChannel(channelRef.current)

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
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) return prev
            return [...prev, payload.new]
          })
          if (payload.new.type === 'file' || payload.new.type === 'image') {
            setFileCount((prev) => prev + 1)
          }
          if (payload.new.type === 'video') {
            setVideoCount((prev) => prev + 1)
          }
        }
      )
      channel.subscribe()
      channelRef.current = channel
    }

    init()
    return () => {
      isMounted = false
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [targetUsername])

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !conversationId) return
    const content = newMessage.trim()
    setNewMessage('')

    const myQuestions = messages.filter(
      (m) => m.sender_id === user.id && m.content?.trim().endsWith('?')
    ).length
    const isQuestion = content.endsWith('?')
    const totalQuestions = isQuestion ? myQuestions + 1 : myQuestions
    const triggersAntiInterrogation = totalQuestions >= 6

    const expiresAt = triggersAntiInterrogation
      ? new Date(Date.now() + 30 * 60 * 1000).toISOString()
      : new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()

    await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content,
      type: 'text',
      expires_at: expiresAt,
    })

    if (triggersAntiInterrogation) {
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
        setModal({ type: null })
        alert('Your account has been suspended due to repeated anti-interrogation triggers.')
        router.push('/auth')
      }
    }
  }

  const uploadFile = async (e: any) => {
    const file = e.target.files?.[0]
    if (!file || !user || !conversationId) return

    const isVideo = file.type.startsWith('video/')
    const isImage = file.type.startsWith('image/')

    if (isVideo) {
      if (videoCount >= 1) return alert('Only 1 video allowed in this chat')
      if (file.size > 30 * 1024 * 1024) return alert('Video must be smaller than 30 MB')
    } else {
      if (fileCount >= 4) return alert('Maximum 4 files allowed in this chat')
      if (file.size > 10 * 1024 * 1024) return alert('File must be smaller than 10 MB')
    }

    const fileName = `${conversationId}/${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('chat-photos').upload(fileName, file)
    if (error) return alert('Failed to upload file')

    const { data } = supabase.storage.from('chat-photos').getPublicUrl(fileName)
    const type = isVideo ? 'video' : isImage ? 'image' : 'file'

    await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: data.publicUrl,
      type,
      expires_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    })

    e.target.value = ''
  }

  const deleteMessage = async (id: string) => {
    await supabase.from('messages').update({ deleted: true }).eq('id', id)
    setMessages((prev) => prev.filter((m) => m.id !== id))
  }

  const confirmClearChat = async () => {
    if (!user || !conversationId) return

    await supabase.from('messages').update({ deleted: true }).eq('conversation_id', conversationId)
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
    setModal({ type: null })
  }

  const confirmBlockUser = async () => {
    if (!user || !targetUser) return
    await supabase.from('blocks').insert({
      blocker_id: user.id,
      blocked_id: targetUser.id,
    })
    setModal({ type: null })
    setBlocked(true)
  }

  const confirmReportUser = async () => {
    if (!user || !targetUser || !reportReason.trim()) return

    await supabase.from('reports').insert({
      reporter_id: user.id,
      reported_id: targetUser.id,
      conversation_id: conversationId,
      reason: reportReason.trim(),
    })

    const { data: profile } = await supabase
      .from('profiles')
      .select('report_count')
      .eq('id', targetUser.id)
      .maybeSingle()

    const newCount = (profile?.report_count || 0) + 1
    const updateData: any = { report_count: newCount }
    if (newCount >= 5) updateData.status = 'suspended'

    await supabase.from('profiles').update(updateData).eq('id', targetUser.id)

    setReportReason('')
    setModal({ type: null })
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

  return (
    <div className="h-[100dvh] bg-black text-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-zinc-900/95 backdrop-blur px-3 py-2 border-b border-zinc-800 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] text-zinc-500">Chatting with</p>
            <h1 className="text-sm sm:text-base font-bold text-cyan-400 truncate">
              {targetUsername}
            </h1>
          </div>

          <div className="flex items-center gap-1 flex-wrap justify-end">
            <span className="text-[10px] text-zinc-400 bg-zinc-800 px-2 py-1 rounded-full">
              {fileCount}/4
            </span>
            <span className="text-[10px] text-zinc-400 bg-zinc-800 px-2 py-1 rounded-full">
              {videoCount}/1
            </span>
            <button
              onClick={() => setModal({ type: 'clear' })}
              className="text-[10px] bg-orange-600 hover:bg-orange-500 px-2 py-1 rounded-lg"
            >
              Clear
            </button>
            <button
              onClick={() => setModal({ type: 'report' })}
              className="text-[10px] bg-yellow-600 hover:bg-yellow-500 px-2 py-1 rounded-lg"
            >
              Report
            </button>
            <button
              onClick={() => setModal({ type: 'block' })}
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

      {/* Messages - smaller wall */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 max-h-[calc(100dvh-140px)]">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center pt-10">
            <div className="text-3xl mb-2 opacity-40">💬</div>
            <p className="text-zinc-400 text-sm">No messages yet</p>
            <p className="text-zinc-600 text-xs mt-1">Send a message to start</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`relative max-w-[80%] px-3 py-2 rounded-2xl text-sm ${
                  msg.sender_id === user?.id
                    ? 'bg-cyan-500 text-black rounded-br-md'
                    : 'bg-zinc-800 text-white rounded-bl-md'
                }`}
              >
                {msg.type === 'image' && (
                  <div className="relative">
                    <img src={msg.content} alt="photo" className="rounded-xl max-h-40 object-cover" />
                    <a
                      href={msg.content}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-2 py-1 rounded-lg"
                    >
                      Download
                    </a>
                  </div>
                )}
                {msg.type === 'video' && (
                  <div className="relative">
                    <video src={msg.content} controls className="rounded-xl max-h-40" />
                    <a
                      href={msg.content}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-2 py-1 rounded-lg"
                    >
                      Download
                    </a>
                  </div>
                )}
                {msg.type === 'file' && (
                  <div className="flex items-center gap-2">
                    <span>📄</span>
                    <a href={msg.content} download target="_blank" rel="noopener noreferrer" className="underline text-xs">
                      Download file
                    </a>
                  </div>
                )}
                {msg.type === 'text' && msg.content}
                {msg.sender_id === user?.id && (
                  <button
                    onClick={() => deleteMessage(msg.id)}
                    className="absolute -top-2 -right-2 bg-red-600 text-white text-xs w-5 h-5 rounded-full"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-zinc-900 px-3 py-2 border-t border-zinc-800 shrink-0">
        <div className="flex gap-2 items-center">
          <label className="cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-xl">
            📎
            <input
              type="file"
              accept="image/*,video/*,.pdf,.doc,.docx,.txt,.zip"
              onChange={uploadFile}
              className="hidden"
            />
          </label>
          <textarea
  placeholder="Type a message..."
  value={newMessage}
  onChange={(e) => setNewMessage(e.target.value)}
  rows={2}
  className="flex-1 min-w-0 p-2.5 rounded-xl bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-cyan-400 text-sm resize-none"
/>
          />
          <button
            onClick={sendMessage}
            className="bg-cyan-500 hover:bg-cyan-400 text-black font-medium px-4 py-2.5 rounded-xl text-sm"
          >
            Send
          </button>
        </div>
        <p className="text-[10px] text-zinc-500 mt-1 text-center">
          Max 4 files (10MB) • Max 1 video (30MB)
        </p>
      </div>

      {/* Custom Modal */}
      {modal.type && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 w-full max-w-sm">
            {modal.type === 'clear' && (
              <>
                <h3 className="text-lg font-semibold mb-2">Clear chat?</h3>
                <p className="text-zinc-400 text-sm mb-5">This will clear all messages in this chat.</p>
                <div className="flex gap-2">
                  <button onClick={() => setModal({ type: null })} className="flex-1 bg-zinc-700 py-2 rounded-xl">Cancel</button>
                  <button onClick={confirmClearChat} className="flex-1 bg-orange-600 py-2 rounded-xl">Clear</button>
                </div>
              </>
            )}

            {modal.type === 'block' && (
              <>
                <h3 className="text-lg font-semibold mb-2">Block {targetUsername}?</h3>
                <p className="text-zinc-400 text-sm mb-5">You will not be able to chat with this user.</p>
                <div className="flex gap-2">
                  <button onClick={() => setModal({ type: null })} className="flex-1 bg-zinc-700 py-2 rounded-xl">Cancel</button>
                  <button onClick={confirmBlockUser} className="flex-1 bg-red-600 py-2 rounded-xl">Block</button>
                </div>
              </>
            )}

            {modal.type === 'report' && (
              <>
                <h3 className="text-lg font-semibold mb-2">Report {targetUsername}</h3>
                <input
                  type="text"
                  placeholder="Reason..."
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full p-3 mb-4 rounded-xl bg-zinc-800 border border-zinc-700 text-sm"
                />
                <div className="flex gap-2">
                  <button onClick={() => setModal({ type: null })} className="flex-1 bg-zinc-700 py-2 rounded-xl">Cancel</button>
                  <button onClick={confirmReportUser} className="flex-1 bg-yellow-600 py-2 rounded-xl">Report</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}