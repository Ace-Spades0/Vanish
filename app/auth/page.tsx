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
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'login' | 'forgot' | 'reset'>('login')
  const [captchaToken, setCaptchaToken] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [lang, setLangState] = useState<Lang>('en')
  const router = useRouter()
  const t = translations[lang]

  useEffect(() => {
    setLangState(getLang())

    const hash = typeof window !== 'undefined' ? window.location.hash : ''
    if (hash.includes('type=recovery')) {
      setMode('reset')
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('reset')
        setMessage('Enter your new password below.')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const changeLang = (next: Lang) => {
    setLang(next)
    setLangState(next)
  }

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
    if (!captchaToken) {
      setMessage('Please complete the CAPTCHA')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
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
    if (!captchaToken) {
      setMessage('Please complete the CAPTCHA')
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

    const userId = data.user?.id
    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('status')
        .eq('id', userId)
        .maybeSingle()

      if (profile?.status === 'suspended') {
        await supabase.auth.signOut()
        setMessage('Your account has been suspended.')
        setLoading(false)
        return
      }
      if (profile?.status === 'banned') {
        await supabase.auth.signOut()
        setMessage('Your account has been banned.')
        setLoading(false)
        return
      }
    }

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
      redirectTo: `${window.location.origin}/auth`,
    })

    if (error) setMessage(error.message)
    else setMessage('Password reset link sent! Check your email.')
    setLoading(false)
  }

  const handleUpdatePassword = async () => {
    setLoading(true)
    setMessage('')

    if (newPassword.length < 6) {
      setMessage('Password must be at least 6 characters')
      setLoading(false)
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage('Passwords do not match')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    setMessage('Password updated successfully. You can now log in.')
    setMode('login')
    setNewPassword('')
    setConfirmPassword('')
    setLoading(false)
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

      <div className="w-full max-w-md bg-zinc-900/90 backdrop-blur border border-zinc-800 p-8 rounded-3xl shadow-2xl">
        <h1 className="text-3xl font-bold mb-2 text-center">{t.appName}</h1>
        <p className="text-zinc-400 text-center mb-8">{t.tagline}</p>

        {mode === 'reset' ? (
          <>
            <p className="text-zinc-400 text-sm text-center mb-6">{t.setNewPassword}</p>
            <div className="relative mb-4">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder={t.newPassword}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full p-3 pr-16 rounded-xl bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-cyan-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-cyan-400"
              >
                {showPassword ? t.hide : t.show}
              </button>
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder={t.confirmNewPassword}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full p-3 mb-6 rounded-xl bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-cyan-400"
            />
            <button
              onClick={handleUpdatePassword}
              disabled={loading}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-medium py-3 rounded-xl mb-3 transition"
            >
              {loading ? t.pleaseWait : t.updatePassword}
            </button>
            <button
              onClick={() => {
                setMode('login')
                setMessage('')
              }}
              className="w-full bg-zinc-700 hover:bg-zinc-600 text-white font-medium py-3 rounded-xl transition"
            >
              {t.backToLogin}
            </button>
          </>
        ) : mode === 'login' ? (
          <>
            <input
              type="email"
              placeholder={t.email}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 mb-4 rounded-xl bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-cyan-400"
            />
            <div className="relative mb-2">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder={t.password}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 pr-16 rounded-xl bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-cyan-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-cyan-400"
              >
                {showPassword ? t.hide : t.show}
              </button>
            </div>
            <div className="text-right mb-4">
              <button
                onClick={() => {
                  setMode('forgot')
                  setMessage('')
                }}
                className="text-sm text-cyan-400 hover:text-cyan-300"
              >
                {t.forgotPassword}
              </button>
            </div>
            <div className="mb-4 flex justify-center">
              <Turnstile
                siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
                onSuccess={(token) => setCaptchaToken(token)}
              />
            </div>
            <label className="flex items-start gap-2 mb-4 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                {t.acceptTerms}{' '}
                <button type="button" onClick={() => router.push('/terms')} className="text-cyan-400 hover:underline">
                  {t.terms}
                </button>{' '}
                {t.and}{' '}
                <button type="button" onClick={() => router.push('/privacy')} className="text-cyan-400 hover:underline">
                  {t.privacy}
                </button>
              </span>
            </label>
            <button
              onClick={handleSignUp}
              disabled={loading || !acceptedTerms}
              className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-black font-medium py-3 rounded-xl mb-3 transition"
            >
              {loading ? t.pleaseWait : t.signUp}
            </button>
            <button
              onClick={handleLogin}
              disabled={loading || !acceptedTerms}
              className="w-full bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white font-medium py-3 rounded-xl transition"
            >
              {loading ? t.pleaseWait : t.login}
            </button>
          </>
        ) : (
          <>
            <p className="text-zinc-400 text-sm text-center mb-6">{t.resetHelp}</p>
            <input
              type="email"
              placeholder={t.email}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 mb-6 rounded-xl bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-cyan-400"
            />
            <button
              onClick={handleForgotPassword}
              disabled={loading}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-medium py-3 rounded-xl mb-3 transition"
            >
              {loading ? t.pleaseWait : t.sendResetLink}
            </button>
            <button
              onClick={() => {
                setMode('login')
                setMessage('')
              }}
              className="w-full bg-zinc-700 hover:bg-zinc-600 text-white font-medium py-3 rounded-xl transition"
            >
              {t.backToLogin}
            </button>
          </>
        )}

        {message && <p className="mt-6 text-center text-sm text-cyan-400">{message}</p>}

        <div className="mt-8 flex items-center justify-center gap-4 text-xs text-zinc-500">
          <button onClick={() => router.push('/terms')} className="hover:text-cyan-400 transition">
            {t.termsShort}
          </button>
          <span>•</span>
          <button onClick={() => router.push('/privacy')} className="hover:text-cyan-400 transition">
            {t.privacyShort}
          </button>
        </div>
      </div>
    </div>
  )
}