'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const OPTIONS = [
  { minutes: 30, label: '30 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 180, label: '3 hours' },
  { minutes: 1440, label: '24 hours' },
]

export default function NewGroupPage() {
  const router = useRouter()
  const [duration, setDuration] = useState(180)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const init = async () => {
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

      const permanent = !!profile?.is_permanent_username && !!profile?.username
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

      setLoading(false)
    }
    init()
  }, [router])

  const create = async () => {
    setCreating(true)
    setError('')
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) {
      router.replace('/')
      return
    }

    const res = await fetch('/api/groups/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ duration_minutes: duration }),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.error) {
      setError(data.error || 'Could not create group')
      setCreating(false)
      return
    }

    if (!data.group?.id) {
      setError('Could not create group')
      setCreating(false)
      return
    }

    router.replace(`/group/${data.group.id}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-zinc-400">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
        <h1 className="text-2xl font-semibold mb-2">New vanishing group</h1>
        <p className="text-sm text-zinc-400 mb-6">
          You are admin. If you leave or wipe identity, the group dies. Set when
          it vanishes.
        </p>
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
          Group dies after
        </p>
        <div className="flex flex-wrap gap-2 mb-6">
          {OPTIONS.map((o) => (
            <button
              key={o.minutes}
              type="button"
              onClick={() => setDuration(o.minutes)}
              className={`px-3 py-2 rounded-xl text-sm border ${
                duration === o.minutes
                  ? 'bg-cyan-500 text-black border-cyan-400'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-200'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <button
          onClick={create}
          disabled={creating}
          className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-semibold py-3 rounded-xl"
        >
          {creating ? 'Creating…' : 'Create group'}
        </button>
        {error && (
          <p className="mt-4 text-center text-sm text-red-400">{error}</p>
        )}
        <button
          onClick={() => router.push('/search')}
          className="w-full mt-4 text-sm text-zinc-400 hover:text-white"
        >
          ← Back
        </button>
      </div>
    </div>
  )
}