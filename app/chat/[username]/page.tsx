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
  const [photoCount, setPhotoCount] = useState(0)
  const [blocked, setBlocked] = useState(false)
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
        .select('username, username_claimed_at')
        .eq('id', user.id)
        .maybeSingle()

      const hasValidUsername =
        myProfile?.username &&
        myProfile.username_claimed_at &&
        (Date.now() - new Date(myProfile.username_claimed_at).getTime()) /
          (1000 * 60 * 60) < 24

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
        (Date.now() - new Date(targetProfile.username_claimed_at).getTime()) /
        (1000 * 60 * 60)

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
        setPhotoCount(existingMessages.filter((m) => m.type === 'image').length)
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
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) return prev
            return [...prev, payload.new]
          })
          if (payload.new.type === 'image') {
            setPhotoCount((prev) => prev + 1)
          }
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

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !conversationId) return

    const content = newMessage.trim()
    setNewMessage('')

    const myQuestions = messages.filter(
      (m) => m.sender_id === user.id && m.content?.trim().endsWith('?')
    ).length

    const isQuestion = content.endsWith('?')
    const totalQuestions = isQuestion ? myQuestions + 1 : myQuestions

    const expiresAt =
      totalQuestions >= 6
        ? new Date(Date.now() + 30 * 60 * 1000).toISOString()
        : new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()

    await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content,
      type: 'text',
      expires_at: expiresAt,
    })
  }

  const uploadPhoto = async (e: any) => {
    if (photoCount >= 2) {
      alert('Maximum 2 photos allowed in this chat')
      return
    }

    const file = e.target.files?.[0]
    if (!file || !user || !conversationId) return

    const fileName = `${conversationId}/${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('chat-photos').upload(fileName, file)

    if (error) {
      alert('Failed to upload photo')
      return
    }

    const { data } = supabase.storage.from('chat-photos').getPublicUrl(fileName)

    await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: data.publicUrl,
      type: 'image',
      expires_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    })
  }

  const deleteMessage = async (id: string) => {
    await supabase.from('messages').update({ deleted: true }).eq('id', id)
    setMessages((prev) => prev.filter((m) => m.id !== id))
  }

  const blockUser = async () => {
    if (!user || !targetUser) return
    if (!confirm(`Block ${targetUsername}?`)) return

    await supabase.from('blocks').insert({
      blocker_id: user.id,
      blocked_id: targetUser.id,
    })

    setBlocked(true)
  }

  const reportUser = async () => {
    if (!user || !targetUser) return

    const reason = prompt('Why are you reporting this user?')
    if (!reason) return

    await supabase.from('reports').insert({
      reporter_id: user.id,
      reported_id: targetUser.id,
      conversation_id: conversationId,
      reason,
    })

    alert('User reported. Thank you.')
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
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="bg-zinc-900/95 backdrop-blur p-4 flex items-center justify-between border-b border-zinc-800">
        <div>
          <p className="text-xs text-zinc-500">Chatting with</p>
          <h1 className="text-lg font-bold text-cyan-400">{targetUsername}</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-400 bg-zinc-800 px-2.5 py-1 rounded-full">
            {photoCount}/2 photos
          </span>
          <button
            onClick={reportUser}
            className="text-xs bg-yellow-600 hover:bg-yellow-500 px-3 py-1.5 rounded-lg transition"
          >
            Report
          </button>
          <button
            onClick={blockUser}
            className="text-xs bg-red-600 hover:bg-red-500 px-3 py-1.5 rounded-lg transition"
          >
            Block
          </button>
          <button
            onClick={() => router.push('/home')}
            className="text-xs bg-zinc-700 hover:bg-zinc-600 px-3 py-1.5 rounded-lg transition"
          >
            Back
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center pt-20">
            <div className="text-5xl mb-4 opacity-40">💬</div>
            <p className="text-zinc-400 text-lg">No messages yet</p>
            <p className="text-zinc-600 text-sm mt-1">
              Send a message to start the conversation
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${
                msg.sender_id === user?.id ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`relative max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                  msg.sender_id === user?.id
                    ? 'bg-cyan-500 text-black rounded-br-md'
                    : 'bg-zinc-800 text-white rounded-bl-md'
                }`}
              >
                {msg.type === 'image' ? (
                  <img
                    src={msg.content}
                    alt="photo"
                    className="rounded-xl max-w-full max-h-64 object-cover"
                  />
                ) : (
                  msg.content
                )}

                {msg.sender_id === user?.id && (
                  <button
                    onClick={() => deleteMessage(msg.id)}
                    className="absolute -top-2 -right-2 bg-red-600 hover:bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center transition"
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

      <div className="bg-zinc-900 p-4 border-t border-zinc-800">
        <div className="flex gap-3 items-center">
          <label className="cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-4 py-3 rounded-xl text-lg transition">
            📷
            <input
              type="file"
              accept="image/*"
              onChange={uploadPhoto}
              className="hidden"
            />
          </label>

          <input
            type="text"
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            className="flex-1 p-3 rounded-xl bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-cyan-400 text-sm"
          />

          <button
            onClick={sendMessage}
            className="bg-cyan-500 hover:bg-cyan-400 text-black font-medium px-5 py-3 rounded-xl transition"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}