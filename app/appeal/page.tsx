'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getLang, translations, type Lang } from '@/lib/i18n'

function StatusBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase()
  if (s === 'pending') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-600 bg-zinc-800/90 px-3 py-1 text-xs font-semibold tracking-wide text-zinc-300">
        <span aria-hidden>⚠️</span>
        PENDING
      </span>
    )
  }
  if (s === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/50 bg-red-950/80 px-3 py-1 text-xs font-semibold tracking-wide text-red-400">
        <span aria-hidden>⛔</span>
        REJECTED
      </span>
    )
  }
  if (s === 'approved') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-950/60 px-3 py-1 text-xs font-semibold tracking-wide text-emerald-400">
        <span aria-hidden>✓</span>
        APPROVED
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-400">
      {status || '—'}
    </span>
  )
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0m'
  const totalMin = Math.floor(ms / 60000)
  const days = Math.floor(totalMin / (60 * 24))
  const hours = Math.floor((totalMin % (60 * 24)) / 60)
  const mins = totalMin % 60
  if (days > 0) return `${days}d ${hours}h ${mins}m`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

export default function AppealPage() {
  const router = useRouter()
  const [lang, setLangState] = useState<Lang>('en')
  const t = translations[lang]
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [statusMsg, setStatusMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [profile, setProfile] = useState<any>(null)
  const [appeals, setAppeals] = useState<any[]>([])
  const [remainLabel, setRemainLabel] = useState('')

  useEffect(() => {
    setLangState(getLang())
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth')
        return
      }

      const { data: p } = await supabase
        .from('profiles')
        .select('status, suspended_until, username')
        .eq('id', user.id)
        .maybeSingle()

      if (!p || (p.status !== 'suspended' && p.status !== 'banned')) {
        router.push('/home')
        return
      }

      if (p.status === 'suspended' && p.suspended_until) {
        const until = new Date(p.suspended_until).getTime()
        if (until <= Date.now()) {
          await supabase
            .from('profiles')
            .update({ status: 'active', suspended_until: null })
            .eq('id', user.id)
          router.push('/home')
          return
        }
      }

      setProfile(p)

      const {
        data: { session },
      } = await supabase.auth.getSession()
      const res = await fetch('/api/appeal', {
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      })
      const data = await res.json()
      setAppeals(data.appeals || [])
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (!profile?.suspended_until || profile?.status === 'banned') {
      setRemainLabel('')
      return
    }
    const tick = () => {
      const ms = new Date(profile.suspended_until).getTime() - Date.now()
      if (ms <= 0) {
        setRemainLabel('0m')
        router.push('/home')
        return
      }
      setRemainLabel(formatCountdown(ms))
    }
    tick()
    const id = setInterval(tick, 30000)
    return () => clearInterval(id)
  }, [profile?.suspended_until, profile?.status])

  const submit = async () => {
    setSending(true)
    setStatusMsg('')
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const res = await fetch('/api/appeal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({ message }),
    })
    const data = await res.json()
    if (data.error) {
      setStatusMsg(data.error)
      setSending(false)
      return
    }
    if (data.auto_restored) {
      setStatusMsg(
        'Appeal accepted. Your account is active again. Redirecting…'
      )
      setTimeout(() => router.push('/home'), 1500)
      setSending(false)
      return
    }
    setStatusMsg(
      data.message ||
        'Appeals are reviewed; a decision can restore access. Please wait.'
    )
    setMessage('')
    const res2 = await fetch('/api/appeal', {
      headers: { Authorization: `Bearer ${session?.access_token || ''}` },
    })
    const data2 = await res2.json()
    setAppeals(data2.appeals || [])
    setSending(false)
  }

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/auth')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-zinc-400">{t.loading || 'Loading...'}</p>
      </div>
    )
  }

  const until =
    profile?.suspended_until &&
    new Date(profile.suspended_until).toLocaleString()

  const hasPending = appeals.some(
    (a) => (a.status || '').toLowerCase() === 'pending'
  )

  return (
    <div className="min-h-screen bg-black text-white px-4 py-10">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-2">Account suspended</h1>
        <p className="text-sm text-zinc-400 mb-4 leading-relaxed">
          Appeals are reviewed; a decision can restore access. Private chats are
          not read for fun — only safety decisions on reports and appeals.
        </p>

        {profile?.status === 'banned' ? (
          <p className="text-red-400 text-sm mb-6">
            This account is permanently restricted. You may still submit an
            appeal.
          </p>
        ) : (
          <div className="mb-6 rounded-2xl border border-cyan-500/20 bg-zinc-900/80 p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">
              Time until account can be fully active
            </p>
            <p className="text-2xl font-semibold text-cyan-400 tabular-nums">
              {remainLabel || '—'}
            </p>
            <p className="text-xs text-zinc-500 mt-2">
              Ends: {until || '—'}
            </p>
            <p className="text-[11px] text-zinc-500 mt-2">
              Suspensions of 24 hours or less stay in place unless a human
              restores access. Longer suspensions or bans may be restored after
              appeal review.
            </p>
          </div>
        )}

        {profile?.status === 'suspended' || profile?.status === 'banned' ? (
          !hasPending ? (
            <>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 500))}
                placeholder="Explain why your account should be restored (max 500)"
                rows={5}
                className="w-full p-3 rounded-xl bg-zinc-900 border border-zinc-700 text-sm mb-2"
              />
              <p className="text-xs text-zinc-500 mb-3">{message.length}/500</p>
              <button
                onClick={submit}
                disabled={sending}
                className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-3 rounded-xl disabled:opacity-50 mb-4"
              >
                {sending ? 'Please wait...' : 'Submit appeal'}
              </button>
            </>
          ) : (
            <p className="text-sm text-zinc-400 mb-4">
              You already have an appeal under review. Wait for a decision or
              for the timer to reach zero.
            </p>
          )
        ) : null}

        {statusMsg && (
          <p className="text-center text-sm text-cyan-400 mb-4">{statusMsg}</p>
        )}

        {appeals.length > 0 && (
          <div className="space-y-3 mb-8">
            {appeals.map((a) => (
              <div
                key={a.id}
                className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <StatusBadge status={a.status} />
                  <p className="text-[11px] text-zinc-500">
                    {a.created_at
                      ? new Date(a.created_at).toLocaleString()
                      : '—'}
                  </p>
                </div>
                <p className="text-sm text-zinc-200 whitespace-pre-wrap">
                  {a.message}
                </p>
                {a.admin_note && (
                  <p className="text-xs text-cyan-400/90 mt-2">{a.admin_note}</p>
                )}
              </div>
            ))}
          </div>
        )}

        <button
          onClick={logout}
          className="w-full bg-zinc-800 hover:bg-zinc-700 py-3 rounded-xl"
        >
          Logout
        </button>
      </div>
    </div>
  )
}