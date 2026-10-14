'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getLang, setLang, translations, type Lang } from '@/lib/i18n'

const ADMIN_ID = 'a78d8a8e-de03-4159-a3c2-b5788e7cf5b7'

function isUsernameActive(profile: {
  id?: string | null
  username?: string | null
  username_claimed_at?: string | null
  is_permanent_username?: boolean | null
}) {
  if (!profile?.username) return false
  if (profile.is_permanent_username === true) return true
  if (profile.id === ADMIN_ID || profile.username.toLowerCase() === 'lestat') {
    return true
  }
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
  const [showSafety, setShowSafety] = useState(false)
  const router = useRouter()
  const t = translations[lang]

  const copy = {
    en: {
      back: '← Back',
      searchTitle: 'Search',
      searchHelp: 'Find someone by their exact username',
      placeholder: 'Enter username',
      searching: 'Searching...',
      searchBtn: 'Search',
      foundUser: 'Found user',
      startChat: 'Start Chat',
      loading: 'Loading...',
      enterUsername: 'Please enter a username',
      notFound: 'User not found',
      ownUsername: 'That is your own username',
      notAvailable: 'User not available',
      offline: 'User is offline',
      beforeTitle: 'Before you start',
      safety1: 'Chats are temporary and may disappear after a limited time.',
      safety2: 'Do not share passwords, codes, or money details.',
      safety3: 'If someone pressures or threatens you, use Report or Block.',
      safety4: 'You can leave or clear the chat at any time.',
      safety5:
        'Your vanish timer is private. The chat ends at the shorter of both timers.',
      activeChats: 'Active chats',
      caps: 'NO ONLINE SERVICE CAN GUARANTEE PERFECT SECURITY. DO NOT SHARE SECRETS YOU CANNOT AFFORD TO EXPOSE.',
      cancel: 'Cancel',
      understand: 'I understand — Start',
    },
    sw: {
      back: '← Rudi',
      searchTitle: 'Tafuta',
      searchHelp: 'Tafuta mtu kwa jina lake kamili la utumizi',
      placeholder: 'Weka jina la utumizi',
      searching: 'Inatafuta...',
      searchBtn: 'Tafuta',
      foundUser: 'Mtumiaji amepatikana',
      startChat: 'Anza gumzo',
      loading: 'Inapakia...',
      enterUsername: 'Tafadhali weka jina la utumizi',
      notFound: 'Mtumiaji hajapatikana',
      ownUsername: 'Hilo ni jina lako mwenyewe',
      notAvailable: 'Mtumiaji hapopatikani',
      offline: 'Mtumiaji yuko nje ya mtandao',
      beforeTitle: 'Kabla ya kuanza',
      safety1: 'Gumzo ni la muda na linaweza kutoweka baada ya muda mdogo.',
      safety2: 'Usishiriki nenosiri, nambari za siri, au maelezo ya pesa.',
      safety3: 'Mtu akikushinikiza au kukutishia, tumia Ripoti au Zuia.',
      safety4: 'Unaweza kuondoka au kufuta gumzo wakati wowote.',
      safety5:
        'Kipima muda chako ni siri. Gumzo linaisha kwa muda mfupi kati ya wawili.',
      activeChats: 'Gumzo zinazoendelea',
      caps: 'HAKUNA HUDUMA MTANDAONI INAYOHAKIKISHA USALAMA KAMILI. USISHIRIKI SIRI USIZOWEZA KUBEBWA KAMA ZIKIFICHULIWA.',
      cancel: 'Ghairi',
      understand: 'Nimeelewa — Anza',
    },
  }[lang]

  useEffect(() => {
    setLangState(getLang())

    let channel: any = null

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
        .select(
          'id, username, username_claimed_at, is_permanent_username, status, suspended_until'
        )
        .eq('id', user.id)
        .maybeSingle()

      if (profile?.status === 'banned') {
        await supabase.auth.signOut()
        router.push('/auth')
        return
      }

      if (profile?.status === 'suspended') {
        const until = profile.suspended_until
          ? new Date(profile.suspended_until).getTime()
          : null
        if (!(until && until <= Date.now())) {
          await supabase.auth.signOut()
          router.push('/auth')
          return
        }
      }

      if (!isUsernameActive(profile || {})) {
        router.push('/username')
        return
      }

      setChecking(false)

      channel = supabase
        .channel(`search-profile-status-${user.id}`)
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

    checkUser()

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
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
      setMessage(copy.enterUsername)
      setLoading(false)
      return
    }

    let found: any = null
    let error: any = null

    if (q.toLowerCase() === 'lestat') {
      const res = await supabase
        .from('profiles')
        .select(
          'id, username, bio, avatar_icon, is_offline, is_permanent_username, username_claimed_at, status'
        )
        .eq('id', ADMIN_ID)
        .maybeSingle()
      found = res.data
      error = res.error
      if (!found && !error) {
        const res2 = await supabase
          .from('profiles')
          .select(
            'id, username, bio, avatar_icon, is_offline, is_permanent_username, username_claimed_at, status'
          )
          .ilike('username', 'lestat')
          .maybeSingle()
        found = res2.data
        error = res2.error
      }
    } else {
      const res = await supabase
        .from('profiles')
        .select(
          'id, username, bio, avatar_icon, is_offline, is_permanent_username, username_claimed_at, status'
        )
        .ilike('username', q)
        .maybeSingle()
      found = res.data
      error = res.error
    }

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    if (!found) {
      setMessage(copy.notFound)
      setLoading(false)
      return
    }

    if (found.id === currentUser?.id) {
      setMessage(copy.ownUsername)
      setLoading(false)
      return
    }

    if (found.status === 'suspended' || found.status === 'banned') {
      setMessage(copy.notAvailable)
      setLoading(false)
      return
    }

    if (found.is_offline === true && found.username?.toLowerCase() !== 'lestat') {
      setMessage(copy.offline)
      setLoading(false)
      return
    }

    if (!isUsernameActive(found)) {
      setMessage(copy.notFound)
      setLoading(false)
      return
    }

    if (currentUser) {
      const { data: blocks } = await supabase
        .from('blocks')
        .select('id')
        .or(
          `and(blocker_id.eq.${currentUser.id},blocked_id.eq.${found.id}),and(blocker_id.eq.${found.id},blocked_id.eq.${currentUser.id})`
        )
        .limit(1)

      if (blocks && blocks.length > 0) {
        setMessage(copy.notAvailable)
        setLoading(false)
        return
      }
    }

    setResult(found)
    setLoading(false)
  }

  const openSafetyThenChat = () => {
    if (!result?.username) return
    setShowSafety(true)
  }

  const confirmStartChat = () => {
    if (!result?.username) return
    setShowSafety(false)
    router.push(`/chat/${result.username}`)
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-zinc-400">{copy.loading}</p>
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
            {copy.back}
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

        <h1 className="text-3xl font-bold mb-2">
          {t.search || copy.searchTitle}
        </h1>
        <p className="text-zinc-500 text-sm mb-6">{copy.searchHelp}</p>

        <button
          type="button"
          onClick={() => router.push('/chats')}
          className="w-full mb-4 bg-zinc-800 hover:bg-zinc-700 border border-cyan-500/30 text-cyan-300 font-medium py-3 rounded-xl transition"
        >
          {copy.activeChats}
        </button>

        <input
          type="text"
          placeholder={copy.placeholder}
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
          {loading ? copy.searching : copy.searchBtn}
        </button>

        {message && (
          <p className="mt-5 text-center text-sm text-red-400">{message}</p>
        )}

        {result && (
          <div className="mt-6 p-5 bg-zinc-900 rounded-2xl text-center border border-zinc-800">
            <div className="text-3xl mb-2">{result.avatar_icon || '🎭'}</div>
            <p className="text-zinc-400 text-sm mb-1">{copy.foundUser}</p>
            <p className="text-cyan-400 text-xl font-medium mb-1">
              {result.username}
            </p>
            {result.bio ? (
              <p className="text-zinc-400 text-sm mb-4">{result.bio}</p>
            ) : (
              <div className="mb-4" />
            )}
            <button
              onClick={openSafetyThenChat}
              className="w-full bg-zinc-700 hover:bg-zinc-600 text-white py-2.5 rounded-xl transition"
            >
              {copy.startChat}
            </button>
          </div>
        )}
      </div>

      {showSafety && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-3xl p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-white mb-3">
              {copy.beforeTitle}
            </h2>
            <ul className="text-sm text-zinc-300 space-y-2 mb-4 list-disc pl-5">
              <li>{copy.safety1}</li>
              <li>{copy.safety2}</li>
              <li>{copy.safety3}</li>
              <li>{copy.safety4}</li>
              <li>{copy.safety5}</li>
            </ul>
            <p className="text-xs sm:text-sm font-semibold text-cyan-300/95 mb-5 leading-relaxed uppercase tracking-wide">
              {copy.caps}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowSafety(false)}
                className="flex-1 bg-zinc-700 hover:bg-zinc-600 py-3 rounded-xl"
              >
                {copy.cancel}
              </button>
              <button
                onClick={confirmStartChat}
                className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-black font-medium py-3 rounded-xl"
              >
                {copy.understand}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}