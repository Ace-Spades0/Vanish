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
      searchTitle: 'Start a vanishing chat',
      searchHelp: 'Find someone by their exact username',
      enterUsername: 'Enter username',
      searching: 'Searching...',
      search: 'Search',
      foundUser: 'Found user',
      startChatBtn: 'Start Chat',
      activeChats: 'Active chats',
      groupBtn: 'Vanishing group',
      groupHelp: 'Create a temporary group with a one-time vanish link',
      beforeTitle: 'Before you start',
      safety1: 'Chats are temporary and may disappear after a limited time.',
      safety2: 'Do not share passwords, codes, or money details.',
      safety3: 'If someone pressures or threatens you, use Report or Block.',
      safety4: 'You can leave or clear the chat at any time.',
      caps: 'NO ONLINE SERVICE CAN GUARANTEE PERFECT SECURITY. DO NOT SHARE SECRETS YOU CANNOT AFFORD TO EXPOSE.',
      cancel: 'Cancel',
      understand: 'I understand — Start',
    },
    sw: {
      back: '← Rudi',
      searchTitle: 'Anza gumzo la kutoweka',
      searchHelp: 'Tafuta mtu kwa jina lake kamili',
      enterUsername: 'Weka jina la mtumiaji',
      searching: 'Inatafuta...',
      search: 'Tafuta',
      foundUser: 'Mtumiaji amepatikana',
      startChatBtn: 'Anza Gumzo',
      activeChats: 'Gumzo hai',
      groupBtn: 'Kikundi cha kutoweka',
      groupHelp: 'Unda kikundi cha muda na kiungo cha mara moja',
      beforeTitle: 'Kabla ya kuanza',
      safety1: 'Gumzo ni la muda na linaweza kutoweka.',
      safety2: 'Usishiriki nenosiri, nambari, au maelezo ya pesa.',
      safety3: 'Kama kuna shinikizo, tumia Ripoti au Zuia.',
      safety4: 'Unaweza kuondoka au kufuta gumzo wakati wowote.',
      caps: 'HAKUNA HUDUMA MTANDAO INAYOHAKIKISHA USALAMA KAMILI. USISHIRIKI SIRI USIZOWEZA KUHIMILI KUFICHULIWA.',
      cancel: 'Ghairi',
      understand: 'Naelewa — Anza',
    },
  }[lang]

  useEffect(() => {
    setLangState(getLang())

    const checkUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        await supabase.auth.signOut()
        router.replace('/')
        return
      }
      setCurrentUser(user)

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, username, username_claimed_at, is_permanent_username, status')
        .eq('id', user.id)
        .maybeSingle()

      if (profile?.status === 'banned' || profile?.status === 'suspended') {
        router.replace('/appeal')
        return
      }

      if (!isUsernameActive({ ...profile, id: user.id })) {
        await supabase.auth.signOut()
        router.replace('/')
        return
      }

      setChecking(false)
    }

    checkUser()
  }, [router])

  const changeLang = (next: Lang) => {
    setLang(next)
    setLangState(next)
  }

  const handleSearch = async () => {
    setMessage('')
    setResult(null)
    setLoading(true)

    if (!searchText.trim()) {
      setMessage(lang === 'sw' ? 'Weka jina la mtumiaji' : 'Please enter a username')
      setLoading(false)
      return
    }

    const q = searchText.trim().toLowerCase()

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, username, bio, avatar_icon, is_offline, username_claimed_at, is_permanent_username, status')
      .ilike('username', q)
      .maybeSingle()

    if (!profile || !isUsernameActive(profile)) {
      setMessage(lang === 'sw' ? 'Mtumiaji hajapatikana' : 'User not found')
      setLoading(false)
      return
    }

    if (profile.id === currentUser?.id) {
      setMessage(lang === 'sw' ? 'Huwezi kujichagua mwenyewe' : 'You cannot chat with yourself')
      setLoading(false)
      return
    }

    if (profile.is_offline) {
      setMessage(lang === 'sw' ? 'Mtumiaji yuko nje ya mtandao' : 'User is offline')
      setLoading(false)
      return
    }

    if (profile.status === 'banned' || profile.status === 'suspended') {
      setMessage(lang === 'sw' ? 'Mtumiaji haipatikani' : 'User not available')
      setLoading(false)
      return
    }

    const { data: blocked } = await supabase
      .from('blocks')
      .select('id')
      .or(
        `and(blocker_id.eq.${currentUser.id},blocked_id.eq.${profile.id}),and(blocker_id.eq.${profile.id},blocked_id.eq.${currentUser.id})`
      )
      .maybeSingle()

    if (blocked) {
      setMessage(lang === 'sw' ? 'Mtumiaji haipatikani' : 'User not available')
      setLoading(false)
      return
    }

    setResult(profile)
    setLoading(false)
  }

  const openSafety = () => {
    if (!result) return
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
        <p className="text-zinc-400">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white px-4 py-8">
      <div className="max-w-md mx-auto">
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={() => router.push('/home')}
            className="text-sm text-zinc-400 hover:text-white"
          >
            {copy.back}
          </button>
          <div className="flex gap-2 text-xs">
            <button
              onClick={() => changeLang('en')}
              className={lang === 'en' ? 'text-cyan-400' : 'text-zinc-500'}
            >
              EN
            </button>
            <button
              onClick={() => changeLang('sw')}
              className={lang === 'sw' ? 'text-cyan-400' : 'text-zinc-500'}
            >
              SW
            </button>
          </div>
        </div>

        <h1 className="text-2xl font-bold mb-1">{copy.searchTitle}</h1>
        <p className="text-zinc-400 text-sm mb-6">{copy.searchHelp}</p>

        {/* Vanishing group — inside Start vanishing chat */}
        <button
          type="button"
          onClick={() => router.push('/groups/new')}
          className="w-full mb-6 p-4 rounded-2xl bg-zinc-900 border border-cyan-700/50 hover:border-cyan-500 transition text-left"
        >
          <p className="text-cyan-400 font-semibold text-base">{copy.groupBtn}</p>
          <p className="text-zinc-500 text-xs mt-1">{copy.groupHelp}</p>
        </button>

        <button
          type="button"
          onClick={() => router.push('/active-chats')}
          className="w-full mb-6 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-sm text-zinc-300 hover:border-zinc-500 transition"
        >
          {copy.activeChats}
        </button>

        <input
          type="text"
          placeholder={copy.enterUsername}
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
          {loading ? copy.searching : copy.search}
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
              onClick={openSafety}
              className="w-full bg-zinc-700 hover:bg-zinc-600 text-white py-2.5 rounded-xl transition"
            >
              {copy.startChatBtn}
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