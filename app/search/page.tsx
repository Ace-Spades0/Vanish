'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getLang, setLang, translations, type Lang } from '@/lib/i18n'

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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth')
        return
      }
      setCurrentUser(user)

      const { data: profile } = await supabase
        .from('profiles')
        .select('username, username_claimed_at')
        .eq('id', user.id)
        .maybeSingle()

      if (!profile?.username || !profile.username_claimed_at) {
        router.push('/username')
        return
      }

      const hoursPassed =
        (Date.now() - new Date(profile.username_claimed_at).getTime()) / (1000 * 60 * 60)

      if (hoursPassed >= 24) {
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

    if (!searchText.trim()) {
      setMessage('Please enter a username')
      setLoading(false)
      return
    }
    if (!currentUser) {
      setMessage('Please login again')
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', searchText.trim())
      .maybeSingle()

    if (error) {
      setMessage('Something went wrong')
      setLoading(false)
      return
    }
    if (!data || data.is_offline) {
      setMessage('User not found')
      setLoading(false)
      return
    }

    const hoursPassed =
      (Date.now() - new Date(data.username_claimed_at).getTime()) / (1000 * 60 * 60)

    if (hoursPassed >= 24) {
      setMessage('User not found')
      setLoading(false)
      return
    }

    const { data: blocks } = await supabase
      .from('blocks')
      .select('id')
      .or(
        `and(blocker_id.eq.${currentUser.id},blocked_id.eq.${data.id}),and(blocker_id.eq.${data.id},blocked_id.eq.${currentUser.id})`
      )

    if (blocks && blocks.length > 0) {
      setMessage('User not available')
      setLoading(false)
      return
    }

    setResult(data)
    setLoading(false)
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-zinc-400">{t.loading}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4 relative">
      <div className="absolute top-4 right-4 flex gap-2">
        <button
          onClick={() => changeLang('en')}
          className={`text-xs px-3 py-1.5 rounded-full border ${
            lang === 'en' ? 'bg-cyan-500 text-black border-cyan-400' : 'bg-zinc-900 text-zinc-300 border-zinc-700'
          }`}
        >
          EN
        </button>
        <button
          onClick={() => changeLang('sw')}
          className={`text-xs px-3 py-1.5 rounded-full border ${
            lang === 'sw' ? 'bg-cyan-500 text-black border-cyan-400' : 'bg-zinc-900 text-zinc-300 border-zinc-700'
          }`}
        >
          SW
        </button>
      </div>

      <div className="bg-zinc-900/90 backdrop-blur p-8 rounded-3xl w-full max-w-md shadow-2xl border border-zinc-800">
        <h1 className="text-3xl font-bold mb-2 text-center">{t.searchTitle}</h1>
        <p className="text-zinc-400 text-center mb-6 text-sm">{t.searchHelp}</p>

        <input
          type="text"
          placeholder={t.enterUsername}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="w-full p-3 mb-4 rounded-xl bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-cyan-400"
        />

        <button
          onClick={handleSearch}
          disabled={loading}
          className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-medium py-3 rounded-xl transition disabled:opacity-50"
        >
          {loading ? t.searching : t.search}
        </button>

        {message && <p className="mt-5 text-center text-sm text-red-400">{message}</p>}

        {result && (
          <div className="mt-6 p-5 bg-zinc-800 rounded-2xl text-center border border-zinc-700">
            <div className="text-3xl mb-2">{result.avatar_icon || '🎭'}</div>
            <p className="text-zinc-400 text-sm mb-1">{t.foundUser}</p>
            <p className="text-cyan-400 text-xl font-medium mb-1">{result.username}</p>
            {result.bio ? <p className="text-zinc-400 text-sm mb-4">{result.bio}</p> : <div className="mb-4" />}
            <button
              onClick={() => router.push(`/chat/${result.username}`)}
              className="w-full bg-zinc-700 hover:bg-zinc-600 text-white py-2.5 rounded-xl transition"
            >
              {t.startChatBtn}
            </button>
          </div>
        )}

        <button
          onClick={() => router.push('/home')}
          className="w-full mt-6 text-zinc-400 hover:text-white text-sm transition"
        >
          {t.backHome}
        </button>
      </div>
    </div>
  )
}