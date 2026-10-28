'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { requireActiveSession } from '@/lib/sessionGate'

export default function GroupJoinPage() {
  const params = useParams()
  const code = String(params.code || '').toLowerCase()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [message, setMessage] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const init = async () => {
      const session = await requireActiveSession(router)
      if (!session.user) return
      setReady(true)
      setLoading(false)
    }
    init()
  }, [router])

  const join = async () => {
    if (!accepted) {
      setMessage('Please confirm the safety note first')
      return
    }
    setJoining(true)
    setMessage('')
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) {
      router.replace('/')
      return
    }

    const res = await fetch('/api/groups/join', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ code }),
    })
    const data = await res.json()
    if (data.error) {
      setMessage(data.error)
      setJoining(false)
      return
    }
    router.replace(`/group/${data.groupId}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-zinc-400">Loading…</p>
      </div>
    )
  }

  if (!ready) return null

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-3xl p-6 shadow-2xl">
        <h1 className="text-xl font-semibold mb-2">Vanishing group</h1>
        <p className="text-sm text-zinc-400 mb-4">
          One-time style join. Same rules as a temporary letter / chat.
        </p>
        <ul className="text-sm text-zinc-300 space-y-2 mb-4 list-disc pl-5">
          <li>This group is temporary and will disappear.</li>
          <li>Do not share passwords, codes, or money details.</li>
          <li>You can leave at any time. Report abuse if needed.</li>
          <li>If the creator leaves or wipes identity, the group dies.</li>
        </ul>
        <p className="text-xs font-semibold text-cyan-300/95 mb-4 uppercase tracking-wide leading-relaxed">
          NO ONLINE SERVICE CAN GUARANTEE PERFECT SECURITY. DO NOT SHARE SECRETS
          YOU CANNOT AFFORD TO EXPOSE.
        </p>
        <label className="flex items-start gap-3 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-1"
          />
          <span className="text-sm text-zinc-300">
            I understand — join this vanishing group
          </span>
        </label>
        {!accepted && (
          <p className="text-sm text-amber-400/90 mb-3 font-medium">
            Please confirm the safety note first
          </p>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => router.push('/home')}
            className="flex-1 bg-zinc-700 hover:bg-zinc-600 py-3 rounded-xl"
          >
            Cancel
          </button>
          <button
            onClick={join}
            disabled={joining || !accepted}
            className="flex-1 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-black font-medium py-3 rounded-xl"
          >
            {joining ? 'Joining…' : 'Join group'}
          </button>
        </div>
        {message && (
          <p className="mt-4 text-center text-sm text-red-400">{message}</p>
        )}
      </div>
    </div>
  )
}