'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Turnstile } from '@marsidev/react-turnstile'

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
  const router = useRouter()

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''

  const showError = (text: string) => {
    setMessageType('error')
    setMessage(text)
  }

  const showOk = (text: string) => {
    setMessageType('ok')
    setMessage(text)
  }

  /** After login: block banned / suspended with a clear message */
  const enforceAccountStatus = async (userId: string) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('status, suspended_until')
      .eq('id', userId)
      .maybeSingle()

    if (!profile) return { ok: true as const }

    if (profile.status === 'banned') {
      await supabase.auth.signOut()
      return {
        ok: false as const,
        text: 'Your account has been permanently banned. You cannot use Go Vanish.',
      }
    }

    if (profile.status === 'suspended') {
      const untilMs = profile.suspended_until
        ? new Date(profile.suspended_until).getTime()
        : null

      // Timed suspend already finished → reactivate
      if (untilMs && untilMs <= Date.now()) {
        await supabase
          .from('profiles')
          .update({ status: 'active', suspended_until: null })
          .eq('id', userId)
        return { ok: true as const }
      }

      await supabase.auth.signOut()

      if (untilMs && untilMs > Date.now()) {
        const when = new Date(untilMs).toLocaleString()
        return {
          ok: false as const,
          text: `Your account is suspended until ${when}. You cannot log in until then, or until an admin unsuspends you.`,
        }
      }

      return {
        ok: false as const,
        text: 'Your account is suspended. You cannot log in until an admin unsuspends you.',
      }
    }

    return { ok: true as const }
  }

  const handleSignUp = async () => {
    setLoading(true)
    setMessage('')

    if (!acceptedTerms) {
      showError('Please accept Terms of Service and Privacy & Security')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      showError('Password must be at least 6 characters')
      setLoading(false)
      return
    }

    if (isTempEmail(email)) {
      showError('Temporary emails are not allowed. Please use a real email.')
      setLoading(false)
      return
    }

    if (siteKey && !captchaToken) {
      showError('Please complete the captcha')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: siteKey && captchaToken
        ? { captchaToken }
        : undefined,
    })

    if (error) {
      showError(error.message)
    } else {
      showOk('Account created! Please check your email to confirm.')
    }

    setLoading(false)
  }

  const handleLogin = async () => {
    setLoading(true)
    setMessage('')

    if (!acceptedTerms) {
      showError('Please accept Terms of Service and Privacy & Security')
      setLoading(false)
      return
    }

    if (siteKey && !captchaToken) {
      showError('Please complete the captcha')
      setLoading(false)
      return
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
      options: siteKey && captchaToken
        ? { captchaToken }
        : undefined,
    })

    if (error) {
      showError(error.message)
      setLoading(false)
      return
    }

    if (!data.user) {
      showError('Login failed. Please try again.')
      setLoading(false)
      return
    }

    const status = await enforceAccountStatus(data.user.id)
    if (!status.ok) {
      showError(status.text)
      setLoading(false)
      return
    }

    showOk('Login successful!')
    router.push('/home')
    setLoading(false)
  }

  const handleForgotPassword = async () => {
    setLoading(true)
    setMessage('')

    if (!email.trim()) {
      showError('Please enter your email')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo:
        typeof window !== 'undefined'
          ? `${window.location.origin}/auth`
          : undefined,
    })

    if (error) {
      showError(error.message)
    } else {
      showOk('Password reset link sent. Check your email.')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-zinc-900 p-8 rounded-2xl shadow-lg border border-zinc-800">
        <h1 className="text-3xl font-bold mb-2 text-center">VANISH</h1>
        <p className="text-zinc-400 text-center mb-8">Talk freely. Stay private.</p>

        {mode === 'login' && (
          <>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 mb-4 rounded-lg bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-cyan-400"
            />

            <div className="relative mb-4">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-cyan-400 pr-16"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-white"
              >
                {showPassword ? 'Hide' : 'Show'}
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
                I accept the{' '}
                <button
                  type="button"
                  onClick={() => router.push('/terms')}
                  className="text-cyan-400 underline"
                >
                  Terms of Service
                </button>{' '}
                and{' '}
                <button
                  type="button"
                  onClick={() => router.push('/privacy')}
                  className="text-cyan-400 underline"
                >
                  Privacy & Security
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
              {loading ? 'Please wait...' : 'Sign Up'}
            </button>

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-zinc-700 hover:bg-zinc-600 text-white font-medium py-3 rounded-lg transition disabled:opacity-50"
            >
              {loading ? 'Please wait...' : 'Login'}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('forgot')
                setMessage('')
              }}
              className="w-full mt-4 text-sm text-zinc-400 hover:text-cyan-400 transition"
            >
              Forgot password?
            </button>
          </>
        )}

        {mode === 'forgot' && (
          <>
            <p className="text-sm text-zinc-400 mb-4 text-center">
              Enter your email and we will send a reset link.
            </p>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 mb-6 rounded-lg bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-cyan-400"
            />

            <button
              onClick={handleForgotPassword}
              disabled={loading}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-medium py-3 rounded-lg mb-3 transition disabled:opacity-50"
            >
              {loading ? 'Please wait...' : 'Send Reset Link'}
            </button>

            <button
              onClick={() => {
                setMode('login')
                setMessage('')
              }}
              className="w-full bg-zinc-700 hover:bg-zinc-600 text-white font-medium py-3 rounded-lg transition"
            >
              Back to Login
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

        <div className="mt-8 flex items-center justify-center gap-4 text-xs text-zinc-500">
          <button
            onClick={() => router.push('/terms')}
            className="hover:text-cyan-400 transition"
          >
            Terms
          </button>
          <span>•</span>
          <button
            onClick={() => router.push('/privacy')}
            className="hover:text-cyan-400 transition"
          >
            Privacy
          </button>
        </div>
      </div>
    </div>
  )
}