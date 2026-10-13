'use client'

import { useEffect, useState } from 'react'
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
  const [messageType, setMessageType] = useState<'ok' | 'error'>('ok')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'login' | 'forgot'>('login')
  const [captchaToken, setCaptchaToken] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showAppeal, setShowAppeal] = useState(false)
  const [lang, setLangState] = useState<Lang>('en')
  const router = useRouter()
  const t = translations[lang]

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''

  useEffect(() => {
    setLangState(getLang())
  }, [])

  const showError = (text: string) => {
    setMessageType('error')
    setMessage(text)
  }

  const showOk = (text: string) => {
    setMessageType('ok')
    setMessage(text)
  }

  const changeLang = (next: Lang) => {
    setLang(next)
    setLangState(next)
  }

  const enforceAccountStatus = async (userId: string) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('status, suspended_until')
      .eq('id', userId)
      .maybeSingle()

    if (!profile) return { ok: true as const, appeal: false }

    if (profile.status === 'banned') {
      await supabase.auth.signOut()
      return {
        ok: false as const,
        appeal: true,
        text:
          lang === 'sw'
            ? 'Akaunti yako imepigwa marufuku kabisa. Kutuma rufaa, bonyeza Rufaa hapa chini.'
            : 'Your account has been permanently banned. To appeal, tap Appeal below.',
      }
    }

    if (profile.status === 'suspended') {
      const untilMs = profile.suspended_until
        ? new Date(profile.suspended_until).getTime()
        : null

      if (untilMs && untilMs <= Date.now()) {
        await supabase
          .from('profiles')
          .update({ status: 'active', suspended_until: null })
          .eq('id', userId)
        return { ok: true as const, appeal: false }
      }

      await supabase.auth.signOut()

      if (untilMs && untilMs > Date.now()) {
        const when = new Date(untilMs).toLocaleString()
        return {
          ok: false as const,
          appeal: true,
          text:
            lang === 'sw'
              ? `Akaunti yako imesimamishwa hadi ${when}. Kutuma rufaa, bonyeza Rufaa hapa chini.`
              : `Your account is suspended until ${when}. To appeal, tap Appeal below.`,
        }
      }

      return {
        ok: false as const,
        appeal: true,
        text:
          lang === 'sw'
            ? 'Akaunti yako imesimamishwa. Kutuma rufaa, bonyeza Rufaa hapa chini.'
            : 'Your account is suspended. To appeal, tap Appeal below.',
      }
    }

    return { ok: true as const, appeal: false }
  }

  const handleSignUp = async () => {
    setLoading(true)
    setMessage('')
    setShowAppeal(false)

    if (!acceptedTerms) {
      showError(
        lang === 'sw'
          ? 'Tafadhali kubali Sheria na Faragha'
          : 'Please accept Terms of Service and Privacy & Security'
      )
      setLoading(false)
      return
    }

    if (password.length < 6) {
      showError(
        lang === 'sw'
          ? 'Nenosiri liwe angalau herufi 6'
          : 'Password must be at least 6 characters'
      )
      setLoading(false)
      return
    }

    if (isTempEmail(email)) {
      showError(
        lang === 'sw'
          ? 'Barua pepe za muda haziruhusiwi'
          : 'Temporary emails are not allowed. Please use a real email.'
      )
      setLoading(false)
      return
    }

    if (siteKey && !captchaToken) {
      showError(lang === 'sw' ? 'Kamilisha captcha' : 'Please complete the captcha')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: siteKey && captchaToken ? { captchaToken } : undefined,
    })

    if (error) showError(error.message)
    else
      showOk(
        lang === 'sw'
          ? 'Akaunti imeundwa! Angalia barua pepe yako kuthibitisha.'
          : 'Account created! Please check your email to confirm.'
      )

    setLoading(false)
  }

  const handleLogin = async () => {
    setLoading(true)
    setMessage('')
    setShowAppeal(false)

    if (!acceptedTerms) {
      showError(
        lang === 'sw'
          ? 'Tafadhali kubali Sheria na Faragha'
          : 'Please accept Terms of Service and Privacy & Security'
      )
      setLoading(false)
      return
    }

    if (siteKey && !captchaToken) {
      showError(lang === 'sw' ? 'Kamilisha captcha' : 'Please complete the captcha')
      setLoading(false)
      return
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
      options: siteKey && captchaToken ? { captchaToken } : undefined,
    })

    if (error) {
      showError(error.message)
      setLoading(false)
      return
    }

    if (!data.user) {
      showError(lang === 'sw' ? 'Imeshindikana kuingia' : 'Login failed. Please try again.')
      setLoading(false)
      return
    }

    const status = await enforceAccountStatus(data.user.id)
    if (!status.ok) {
      showError(status.text)
      setShowAppeal(!!status.appeal)
      setLoading(false)
      return
    }

    showOk(lang === 'sw' ? 'Umefanikiwa kuingia!' : 'Login successful!')
    router.push('/home')
    setLoading(false)
  }

  const handleForgotPassword = async () => {
    setLoading(true)
    setMessage('')
    setShowAppeal(false)

    if (!email.trim()) {
      showError(lang === 'sw' ? 'Weka barua pepe' : 'Please enter your email')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo:
        typeof window !== 'undefined'
          ? `${window.location.origin}/auth`
          : undefined,
    })

    if (error) showError(error.message)
    else
      showOk(
        lang === 'sw'
          ? 'Kiungo cha kuweka upya nenosiri kimetumwa. Angalia barua pepe.'
          : 'Password reset link sent. Check your email.'
      )

    setLoading(false)
  }

  const handleAppeal = () => {
    alert(
      lang === 'sw'
        ? 'Rufaa bado haijaunganishwa. Tutafungua fomu ya rufaa hivi karibuni.'
        : 'Appeal is not available yet. We will open an appeal form soon.'
    )
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-zinc-900 p-8 rounded-2xl shadow-lg border border-zinc-800">
        <div className="flex justify-end gap-1.5 mb-4">
          <button
            type="button"
            onClick={() => changeLang('en')}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium ${
              lang === 'en'
                ? 'bg-cyan-500 text-black border-cyan-400'
                : 'border-zinc-700 text-zinc-400'
            }`}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => changeLang('sw')}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium ${
              lang === 'sw'
                ? 'bg-cyan-500 text-black border-cyan-400'
                : 'border-zinc-700 text-zinc-400'
            }`}
          >
            SW
          </button>
        </div>

        <h1 className="text-3xl font-bold mb-2 text-center">
          {t.appName || 'VANISH'}
        </h1>
        <p className="text-zinc-400 text-center mb-8">
          {t.tagline || 'Talk freely. Stay private.'}
        </p>

        {mode === 'login' && (
          <>
            <input
              type="email"
              placeholder={lang === 'sw' ? 'Barua pepe' : 'Email'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 mb-4 rounded-lg bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-cyan-400"
            />

            <div className="relative mb-4">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder={lang === 'sw' ? 'Nenosiri' : 'Password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-cyan-400 pr-16"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-white"
              >
                {showPassword
                  ? lang === 'sw'
                    ? 'Ficha'
                    : 'Hide'
                  : lang === 'sw'
                    ? 'Onyesha'
                    : 'Show'}
              </button>
            </div>

            <label className="flex items-start gap-2 mb-4 text-sm text-zinc-400 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-1 accent-cyan-500"
              />
              <span>
                {lang === 'sw' ? 'Ninakubali ' : 'I accept the '}
                <button
                  type="button"
                  onClick={() => router.push('/terms')}
                  className="text-cyan-400 underline"
                >
                  {t.termsShort || 'Terms'}
                </button>
                {lang === 'sw' ? ' na ' : ' and '}
                <button
                  type="button"
                  onClick={() => router.push('/privacy')}
                  className="text-cyan-400 underline"
                >
                  {t.privacyShort || 'Privacy'}
                </button>
              </span>
            </label>

            {siteKey && (
              <div className="mb-4 flex justify-center">
                <Turnstile
                  siteKey={siteKey}
                  onSuccess={(token) => setCaptchaToken(token)}
                  onExpire={() => setCaptchaToken('')}
                  options={{ theme: 'dark' }}
                />
              </div>
            )}

            <button
              onClick={handleSignUp}
              disabled={loading}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-medium py-3 rounded-lg mb-3 transition disabled:opacity-50"
            >
              {loading
                ? lang === 'sw'
                  ? 'Subiri...'
                  : 'Please wait...'
                : t.signUp || 'Sign Up'}
            </button>

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-zinc-700 hover:bg-zinc-600 text-white font-medium py-3 rounded-lg transition disabled:opacity-50"
            >
              {loading
                ? lang === 'sw'
                  ? 'Subiri...'
                  : 'Please wait...'
                : t.login || 'Login'}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('forgot')
                setMessage('')
                setShowAppeal(false)
              }}
              className="w-full mt-4 text-sm text-zinc-400 hover:text-cyan-400 transition"
            >
              {lang === 'sw' ? 'Umesahau nenosiri?' : 'Forgot password?'}
            </button>
          </>
        )}

        {mode === 'forgot' && (
          <>
            <p className="text-sm text-zinc-400 mb-4 text-center">
              {lang === 'sw'
                ? 'Weka barua pepe yako tutakutumia kiungo cha kuweka upya.'
                : 'Enter your email and we will send a reset link.'}
            </p>
            <input
              type="email"
              placeholder={lang === 'sw' ? 'Barua pepe' : 'Email'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 mb-6 rounded-lg bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-cyan-400"
            />

            <button
              onClick={handleForgotPassword}
              disabled={loading}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-medium py-3 rounded-lg mb-3 transition disabled:opacity-50"
            >
              {loading
                ? lang === 'sw'
                  ? 'Subiri...'
                  : 'Please wait...'
                : lang === 'sw'
                  ? 'Tuma kiungo'
                  : 'Send Reset Link'}
            </button>

            <button
              onClick={() => {
                setMode('login')
                setMessage('')
                setShowAppeal(false)
              }}
              className="w-full bg-zinc-700 hover:bg-zinc-600 text-white font-medium py-3 rounded-lg transition"
            >
              {lang === 'sw' ? 'Rudi kuingia' : 'Back to Login'}
            </button>
          </>
        )}

        {message && (
          <p
            className={`mt-6 text-center text-sm leading-relaxed ${
              messageType === 'error' ? 'text-red-400' : 'text-cyan-400'
            }`}
          >
            {message}
          </p>
        )}

        {showAppeal && (
          <button
            type="button"
            onClick={handleAppeal}
            className="w-full mt-4 bg-amber-600 hover:bg-amber-500 text-black font-semibold py-3 rounded-lg transition"
          >
            {lang === 'sw' ? 'Rufaa' : 'Appeal'}
          </button>
        )}

        <div className="mt-8 flex items-center justify-center gap-4 text-xs text-zinc-500">
          <button
            onClick={() => router.push('/terms')}
            className="hover:text-cyan-400 transition"
          >
            {t.termsShort || 'Terms'}
          </button>
          <span>•</span>
          <button
            onClick={() => router.push('/privacy')}
            className="hover:text-cyan-400 transition"
          >
            {t.privacyShort || 'Privacy'}
          </button>
        </div>
      </div>
    </div>
  )
}