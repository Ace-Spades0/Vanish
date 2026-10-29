'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function GroupInviteJoinPage() {
  const params = useParams()
  const code = String(params.code || '').trim().toLowerCase()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    const init = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          router.replace('/')
          return
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('username, username_claimed_at, is_permanent_username')
          .eq('id', user.id)
          .maybeSingle()

        const permanent =
          !!profile?.is_permanent_username && !!profile?.username
        let active = permanent
        if (!active && profile?.username && profile?.username_claimed_at) {
          const hours =
            (Date.now() - new Date(profile.username_claimed_at).getTime()) /
            (1000 * 60 * 60)
          active = hours < 24
        }

        if (!active) {
          await supabase.auth.signOut()
          router.replace('/')
          return
        }

        if (!code) {
          setError('Invalid invite link')
        }
      } catch (e: any) {
        setError(e?.message || 'Could not open invite')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [code, router])

  const join = async () => {
    if (!accepted) {
      setError('Please confirm the safety note first')
      return
    }
    setJoining(true)
    setError('')
    try {
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

      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.error) {
        setError(data.error || 'Could not join group')
        setJoining(false)
        return
      }

      if (!data.group_id) {
        setError('Could not join group')
        setJoining(false)
        return
      }

      router.replace(`/group/${data.group_id}`)
    } catch (e: any) {
      setError(e?.message || 'Could not join group')
      setJoining(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-zinc-400">Loading invite…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white px-4 py-10">
      <div className="max-w-md mx-auto">
        <button
          onClick={() => router.push('/home')}
          className="inline-flex items-center gap-2 text-sm font-medium text-cyan-400 border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 px-4 py-2.5 rounded-full mb-8 transition"
        >
          ← Back to Home
        </button>

        <h1 className="text-2xl font-bold mb-2">Join vanishing group</h1>
        <p className="text-zinc-500 text-sm mb-6">
          One-time style invite. Confirm safety, then join.
        </p>

        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 mb-4">
          <p className="text-xs font-bold text-amber-100 uppercase mb-2">
            Safety
          </p>
          <ul className="text-[11px] text-zinc-400 space-y-1.5 list-disc pl-4 mb-3">
            <li>Group is temporary and can vanish.</li>
            <li>Do not share passwords, codes, or payment details.</li>
            <li>You can leave; admin can end the whole group.</li>
          </ul>
          <p className="text-[11px] font-semibold text-cyan-300 uppercase mb-3">
            NO ONLINE SERVICE CAN GUARANTEE PERFECT SECURITY. DO NOT SHARE
            SECRETS YOU CANNOT AFFORD TO EXPOSE.
          </p>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 accent-cyan-500"
            />
            <span className="text-[11px] text-zinc-300">
              I understand — join this group
            </span>
          </label>
        </div>

        {error && (
          <p className="text-sm text-red-400 mb-4 break-words">{error}</p>
        )}

        <button
          onClick={join}
          disabled={joining}
          className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-semibold py-3 rounded-xl"
        >
          {joining ? 'Joining…' : 'Join group'}
        </button>
      </div>
    </div>
  )
}