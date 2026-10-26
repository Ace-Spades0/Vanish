'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { Turnstile } from '@marsidev/react-turnstile'
import { getLang, setLang, translations, type Lang } from '@/lib/i18n'

function randomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let s = ''
  for (let i = 0; i < 6; i++) {
    s += chars[Math.floor(Math.random() * chars.length)]
  }
  return s
}

export default function AuthPage() {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const [assignedName, setAssignedName] = useState('')
  const [lang, setLangState] = useState<Lang>('en')
  const router = useRouter()
  const t = translations[lang]

  useEffect(() => {
    setLangState(getLang())
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('username, username_claimed_at, is_permanent_username, status')
          .eq('id', user.id)
          .maybeSingle()
        if (profile?.status === 'banned') {
          await supabase.auth.signOut()
          setChecking(false)
          return
        }
        if (profile?.status === 'suspended') {
          router.push('/appeal')
          return
        }
        if (profile?.is_permanent_username && profile.username) {
          router.push('/home')
          return
        }
        if (profile?.username && profile.username_claimed_at) {
          const hours =
            (Date.now() - new Date(profile.username_claimed_at).getTime()) /
            3600000
          if (hours < 24) {
            router.push('/home')
            return
          }
        }
      }
      setChecking(false)
    }
    init()
  }, [])

  const changeLang = (l: Lang) => {
    setLang(l)
    setLangState(l)
  }

  const assignUniqueUsername = async (userId: string) => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const code = randomCode()
      if (code === 'LESTAT') continue
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', code)
        .maybeSingle()
      if (existing && existing.id !== userId) continue

      const { error } = await supabase.from('profiles').upsert({
        id: userId,
        username: code,
        username_claimed_at: new Date().toISOString(),
        is_permanent_username: false,
        is_offline: false,
        status: 'active',
      })
      if (!error) return code
    }
    throw new Error('Could not assign a free name. Try again.')
  }

  const handleGetStarted = async () => {
    setLoading(true)
    setMessage('')
    setAssignedName('')

    if (!acceptedTerms) {
      setMessage('Please accept Terms of Service and Privacy & Security')
      setLoading(false)
      return
    }

    try {
      let {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        const { data, error } = await supabase.auth.signInAnonymously(
          process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && captchaToken
            ? { options: { captchaToken } }
            : undefined
        )
        if (error) {
          setMessage(
            error.message +
              (error.message.toLowerCase().includes('anonymous')
                ? ' — Enable Anonymous sign-ins in Supabase Auth settings.'
                : '')
          )
          setLoading(false)
          return
        }
        user = data.user
      }

      if (!user) {
        setMessage('Could not start session')
        setLoading(false)
        return
      }

      const { data: existing } = await supabase
        .from('profiles')
        .select('username, username_claimed_at, is_permanent_username, status')
        .eq('id', user.id)
        .maybeSingle()

      if (existing?.status === 'banned') {
        await supabase.auth.signOut()
        setMessage('This identity is restricted.')
        setLoading(false)
        return
      }
      if (existing?.status === 'suspended') {
        router.push('/appeal')
        setLoading(false)
        return
      }

      let name = existing?.username || ''
      const stillValid =
        existing?.is_permanent_username ||
        (existing?.username_claimed_at &&
          (Date.now() - new Date(existing.username_claimed_at).getTime()) /
            3600000 <
            24)

      if (!name || !stillValid) {
        name = await assignUniqueUsername(user.id)
      }

      setAssignedName(name)
      setMessage('Your temporary name is ready.')
      setTimeout(() => router.push('/home'), 900)
    } catch (e: any) {
      setMessage(e?.message || 'Something went wrong')
    }
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
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-zinc-900 p-8 rounded-2xl shadow-lg border border-zinc-800">
        <div className="flex justify-end gap-2 mb-4">
          <button
            type="button"
            onClick={() => changeLang('en')}
            className={`text-xs px-2 py-1 rounded ${
              lang === 'en' ? 'text-cyan-400' : 'text-zinc-500'
            }`}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => changeLang('sw')}
            className={`text-xs px-2 py-1 rounded ${
              lang === 'sw' ? 'text-cyan-400' : 'text-zinc-500'
            }`}
          >
            SW
          </button>
        </div>

        <div className="mb-4 flex justify-center">
          <Image
            src="/logo.png"
            alt="Go Vanish"
            width={88}
            height={88}
            className="drop-shadow-[0_0_24px_rgba(34,211,238,0.35)]"
            priority
          />
        </div>

        <h1 className="text-3xl font-bold mb-2 text-center">{t.appName}</h1>
        <p className="text-zinc-400 text-center mb-2">{t.tagline}</p>
        <p className="text-zinc-500 text-center text-sm mb-8">
          No email. No password. We assign a temporary 6-character name.
        </p>

        <label className="flex items-start gap-2 mb-4 text-sm text-zinc-400 cursor-pointer">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            className="mt-1"
          />
          <span>{t.acceptTerms}</span>
        </label>

        {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
          <div className="mb-4 flex justify-center">
            <Turnstile
              siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
              onSuccess={setCaptchaToken}
            />
          </div>
        )}

        <button
          onClick={handleGetStarted}
          disabled={loading}
          className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-medium py-3 rounded-lg transition disabled:opacity-50"
        >
          {loading ? t.pleaseWait : t.getStarted}
        </button>

        {assignedName && (
          <p className="mt-6 text-center text-2xl font-bold tracking-[0.2em] text-cyan-400">
            {assignedName}
          </p>
        )}

        {message && (
          <p className="mt-4 text-center text-sm text-cyan-400">{message}</p>
        )}

        <p className="mt-6 text-[11px] text-zinc-500 text-center leading-relaxed">
          Clearing browser data creates a new identity. Names last 24 hours.
        </p>

        <div className="mt-8 flex items-center justify-center gap-4 text-xs text-zinc-500">
          <button
            onClick={() => router.push('/terms')}
            className="hover:text-cyan-400"
          >
            {t.termsShort}
          </button>
          <span>•</span>
          <button
            onClick={() => router.push('/privacy')}
            className="hover:text-cyan-400"
          >
            {t.privacyShort}
          </button>
        </div>
      </div>
    </div>
  )
}