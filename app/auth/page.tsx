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
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'login' | 'forgot'>('login')
  const [captchaToken, setCaptchaToken] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const router = useRouter()

  const handleSignUp = async () => {
    setLoading(true)
    setMessage('')

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

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Account created! Please check your email to confirm.')
    }

    setLoading(false)
  }

  const handleLogin = async () => {
    setLoading(true)
    setMessage('')

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
      redirectTo: `${window.location.origin}/auth`,
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Password reset link sent! Check your email.')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-zinc-900 p-8 rounded-2xl shadow-lg">
        <h1 className="text-3xl font-bold mb-2 text-center">VANISH</h1>
        <p className="text-zinc-400 text-center mb-8">Talk freely. Stay private.</p>

        {mode === 'login' ? (
          <>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 mb-4 rounded-lg bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-cyan-400"
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 mb-2 rounded-lg bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-cyan-400"
            />

            <div className="text-right mb-4">
              <button
                onClick={() => {
                  setMode('forgot')
                  setMessage('')
                }}
                className="text-sm text-cyan-400 hover:text-cyan-300"
              >
                Forgot password?
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
                I accept the{' '}
                <button
                  type="button"
                  onClick={() => router.push('/terms')}
                  className="text-cyan-400 hover:underline"
                >
                  Terms of Service
                </button>{' '}
                and{' '}
                <button
                  type="button"
                  onClick={() => router.push('/privacy')}
                  className="text-cyan-400 hover:underline"
                >
                  Privacy & Security
                </button>
              </span>
            </label>

            <button
              onClick={handleSignUp}
              disabled={loading}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-medium py-3 rounded-lg mb-3 transition"
            >
              {loading ? 'Please wait...' : 'Sign Up'}
            </button>

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-zinc-700 hover:bg-zinc-600 text-white font-medium py-3 rounded-lg transition"
            >
              {loading ? 'Please wait...' : 'Login'}
            </button>
          </>
        ) : (
          <>
            <p className="text-zinc-400 text-sm text-center mb-6">
              Enter your email and we’ll send you a link to reset your password.
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
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-medium py-3 rounded-lg mb-3 transition"
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
          <p className="mt-6 text-center text-sm text-cyan-400">{message}</p>
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