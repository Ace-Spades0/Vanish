'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function UsernamePage() {
  const [username, setUsername] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const checkExisting = async () => {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/auth')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('username, username_claimed_at')
        .eq('id', user.id)
        .maybeSingle()

      if (profile?.username && profile.username_claimed_at) {
        const hoursPassed =
          (Date.now() - new Date(profile.username_claimed_at).getTime()) /
          (1000 * 60 * 60)

        if (hoursPassed < 24) {
          router.push('/home')
          return
        }
      }

      setChecking(false)
    }

    checkExisting()
  }, [])

  const claim = async () => {
    setMessage('')
    setLoading(true)

    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      setMessage('You must be logged in')
      setLoading(false)
      return
    }

    const res = await fetch('/api/claim-username', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ username }),
    })

    const data = await res.json()

    if (data.error) {
      setMessage(data.error)
      setLoading(false)
    } else {
      setMessage('Username saved successfully!')
      setTimeout(() => {
        router.push('/home')
      }, 800)
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-zinc-400">Checking...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="bg-zinc-900 p-8 rounded-2xl w-full max-w-md shadow-lg">
        <h1 className="text-3xl font-bold mb-2 text-center">Pick a username</h1>
        <p className="text-zinc-400 text-center mb-6 text-sm">
          This name is only yours for 24 hours
        </p>

        <input
          type="text"
          placeholder="Enter a username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full p-3 mb-4 rounded-lg bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-cyan-400"
        />

        <button
          onClick={claim}
          disabled={loading || !username.trim()}
          className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-medium py-3 rounded-lg transition disabled:opacity-50"
        >
          {loading ? 'Please wait...' : 'Save'}
        </button>

        {message && (
          <p className="mt-5 text-center text-sm text-cyan-400">{message}</p>
        )}
      </div>
    </div>
  )
}