'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Turnstile } from '@marsidev/react-turnstile'
import { getLang, setLang, translations, type Lang } from '@/lib/i18n'

const TEMP_EMAIL_DOMAINS = [
  'tempmail.com',
  'mailinator.com',
  'guerrillamail.com',
  '10minutemail.com',
  'yopmail.com',
  'trashmail.com',
  'getnada.com',
  'temp-mail.org',
  'moakt.com',
  'emailondeck.com',
]

function isTempEmail(email: string) {
  const domain = email.trim().toLowerCase().split('@')[1]
  return TEMP_EMAIL_DOMAINS.includes(domain)
}

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'login' | 'forgot'>('login')
  const [captchaToken, setCaptchaToken] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [lang, setLangState] = useState<Lang>('en')
  const router = useRouter()
  const t = translations[lang]

  useState(() => {
    setLangState(getLang())
  })

  const handleSignUp = async () => {
    setLoading(true)
    setMessage('')
    if (!acceptedTerms) {
      setMessage('Please accept Terms of Service and Privacy & Security')
      setLoading(false)
      return
    }
    if (password.length < 6) {
      setMessage('Password must be at least 6 characters')
      setLoading(false)
      return
    }
    if (isTempEmail(email)) {
      setMessage('Temporary emails are not allowed. Please use a real email.')
      setLoading(false)
      return
    }
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: captchaToken
        ? { captchaToken }
        : undefined,
    })
    if (error) setMessage(error.message)
    else setMessage('Account created! Please check your email to confirm.')
    setLoading(false)
  }

  const handleLogin = async () => {
    setLoading(true)
    setMessage('')
    if (!acceptedTerms) {
      setMessage('Please accept Terms of Service and Privacy & Security')
      setLoading(false)
      return
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    const uid = data.user?.id
    if (uid) {
      const { data: p } = await supabase
        .from('profiles')
        .select('status, suspended_until')
        .eq('id', uid)
        .maybeSingle()

      if (p?.status === 'banned') {
        await supabase.auth.signOut()
        setMessage('This account is restricted.')
        setLoading(false)
        return
      }
      if (p?.status === 'suspended') {
        const until = p.suspended_until
          ? new Date(p.suspended_until).getTime()
          : null
        if (!until || until > Date.now()) {
          router.push('/appeal')
          setLoading(false)
          return
        }
      }
    }

    setMessage('Login successful!')
    router.push('/home')
    setLoading(false)
  }

  const handleForgotPassword = async () => {
    setLoading(true)
    setMessage('')
    if (!email.trim()) {
      setMessage('Please enter your email')
      setLoading(false)
      return
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo:
        typeof window !== 'undefined'
          ? `${window.location.origin}/auth`
          : undefined,
    })
    if (error) setMessage(error.message)
    else setMessage('Check your email for the reset link.')
    setLoading(false)
  }

  const changeLang = (l: Lang) => {
    setLang(l)
    setLangState(l)
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-zinc-900 p-8 rounded-2xl shadow-lg border border-zinc-800">
        <div className="flex justify-end gap-2 mb-4">
          <button
            type="button"
            onClick={() => changeLang('en')}
            className={`text-xs px-2 py-1 rounded ${lang === 'en' ? 'text-cyan-400' : 'text-zinc-500'}`}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => changeLang('sw')}
            className={`text-xs px-2 py-1 rounded ${lang === 'sw' ? 'text-cyan-400' : 'text-zinc-500'}`}
          >
            SW
          </button>
        </div>

        <h1 className="text-3xl font-bold mb-2 text-center">{t.appName}</h1>
        <p className="text-zinc-400 text-center mb-8">{t.tagline}</p>

        {mode === 'login' ? (
          <>
            <input
              type="email"
              placeholder={t.email}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 mb-4 rounded-lg bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-cyan-400"
            />
            <div className="relative mb-4">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder={t.password}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-cyan-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>

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
              onClick={handleSignUp}
              disabled={loading}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-medium py-3 rounded-lg mb-3 transition"
            >
              {loading ? t.pleaseWait : t.signUp}
            </button>
            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-zinc-700 hover:bg-zinc-600 text-white font-medium py-3 rounded-lg transition"
            >
              {loading ? t.pleaseWait : t.login}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('forgot')
                setMessage('')
              }}
              className="w-full mt-3 text-sm text-zinc-400 hover:text-cyan-400"
            >
              {t.forgotPassword}
            </button>
          </>
        ) : (
          <>
            <input
              type="email"
              placeholder={t.email}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 mb-6 rounded-lg bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-cyan-400"
            />
            <button
              onClick={handleForgotPassword}
              disabled={loading}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-medium py-3 rounded-lg mb-3 transition"
            >
              {loading ? t.pleaseWait : t.sendResetLink}
            </button>
            <button
              onClick={() => {
                setMode('login')
                setMessage('')
              }}
              className="w-full bg-zinc-700 hover:bg-zinc-600 text-white font-medium py-3 rounded-lg transition"
            >
              {t.backToLogin}
            </button>
          </>
        )}

        {message && (
          <p className="mt-6 text-center text-sm text-cyan-400">{message}</p>
        )}

        <div className="mt-8 flex items-center justify-center gap-4 text-xs text-zinc-500">
          <button onClick={() => router.push('/terms')} className="hover:text-cyan-400">
            {t.termsShort}
          </button>
          <span>•</span>
          <button onClick={() => router.push('/privacy')} className="hover:text-cyan-400">
            {t.privacyShort}
          </button>
        </div>
      </div>
    </div>
  )
}