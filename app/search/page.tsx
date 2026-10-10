'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getLang, setLang, translations, type Lang } from '@/lib/i18n'

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

export default function SearchPage() {
  const [searchText, setSearchText] = useState('')
  const [result, setResult] = useState<any>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [lang, setLangState] = useState<Lang>('en')
  const router = useRouter()
  const t = translations[lang]

  useEffect(() => {
    setLangState(getLang())

    const checkUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth')
        return
      }
      setCurrentUser(user)

      const { data: profile } = await supabase
        .from('profiles')
        .select('username, username_claimed_at, is_permanent_username')
        .eq('id', user.id)
        .maybeSingle()

      if (!isUsernameActive(profile || {})) {
        router.push('/username')
        return
      }

      setChecking(false)
    }

    checkUser()
  }, [])

  const changeLang = (next: Lang) => {
    setLang(next)
    setLangState(next)
  }

  const handleSearch = async () => {
    setMessage('')
    setResult(null)
    setLoading(true)

    const q = searchText.trim()
    if (!q) {
      setMessage('Please enter a username')
      setLoading(false)
      return
    }

    const { data: found, error } = await supabase
      .from('profiles')
      .select(
        'id, username, bio, avatar_icon, is_offline, is_permanent_username, username_claimed_at, status'
      )
      .ilike('username', q)
      .maybeSingle()

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    if (!found) {
      setMessage('User not found')
      setLoading(false)
      return
    }

    if (found.id === currentUser?.id) {
      setMessage('That is your own username')
      setLoading(false)
      return
    }

    if (found.status === 'suspended' || found.status === 'banned') {
      setMessage('User not available')
      setLoading(false)
      return
    }

    if (found.is_offline) {
      setMessage('User is offline')
      setLoading(false)
      return
    }

    // Permanent (LESTAT) always searchable; others need active 24h name
    if (!isUsernameActive(found)) {
      setMessage('User not found')
      setLoading(false)
      return
    }

    // Block either way
    if (currentUser) {
      const { data: blocks } = await supabase
        .from('blocks')
        .select('id')
        .or(
          `and(blocker_id.eq.${currentUser.id},blocked_id.eq.${found.id}),and(blocker_id.eq.${found.id},blocked_id.eq.${currentUser.id})`
        )
        .limit(1)

      if (blocks && blocks.length > 0) {
        setMessage('User not available')
        setLoading(false)
        return
      }
    }

    setResult(found)
    setLoading(false)
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-zinc-400">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[480px] h-[480px] bg-cyan-500/10 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-md mx-auto px-4 py-10">
        <div className="flex justify-between items-center mb-8">
          <button
            onClick={() => router.push('/home')}
            className="inline-flex items-center gap-2 text-sm font-medium text-cyan-400 border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 px-4 py-2.5 rounded-full transition"
          >
            ← Back
          </button>
          <div className="flex gap-1">
            <button
              onClick={() => changeLang('en')}
              className={`text-xs px-2.5 py-1 rounded-full border ${
                lang === 'en'
                  ? 'bg-cyan-500 text-black border-cyan-400'
                  : 'border-zinc-700 text-zinc-500'
              }`}
            >
              EN
            </button>
            <button
              onClick={() => changeLang('sw')}
              className={`text-xs px-2.5 py-1 rounded-full border ${
                lang === 'sw'
                  ? 'bg-cyan-500 text-black border-cyan-400'
                  : 'border-zinc-700 text-zinc-500'
              }`}
            >
              SW
            </button>
          </div>
        </div>

        <h1 className="text-3xl font-bold mb-2">{t.search || 'Search'}</h1>
        <p className="text-zinc-500 text-sm mb-6">
          Find someone by their exact username
        </p>

        <input
          type="text"
          placeholder="Enter username"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="w-full p-3 mb-4 rounded-xl bg-zinc-900 border border-zinc-700 focus:outline-none focus:border-cyan-400"
        />

        <button
          onClick={handleSearch}
          disabled={loading}
          className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-medium py-3 rounded-xl transition disabled:opacity-50"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>

        {message && (
          <p className="mt-5 text-center text-sm text-red-400">{message}</p>
        )}

        {result && (
          <div className="mt-6 p-5 bg-zinc-900 rounded-2xl text-center border border-zinc-800">
            <div className="text-3xl mb-2">{result.avatar_icon || '🎭'}</div>
            <p className="text-zinc-400 text-sm mb-1">Found user</p>
            <p className="text-cyan-400 text-xl font-medium mb-1">
              {result.username}
            </p>
            {result.bio ? (
              <p className="text-zinc-400 text-sm mb-4">{result.bio}</p>
            ) : (
              <div className="mb-4" />
            )}
            <button
              onClick={() => router.push(`/chat/${result.username}`)}
              className="w-full bg-zinc-700 hover:bg-zinc-600 text-white py-2.5 rounded-xl transition"
            >
              Start Chat
            </button>
          </div>
        )}
      </div>
    </div>
  )
}