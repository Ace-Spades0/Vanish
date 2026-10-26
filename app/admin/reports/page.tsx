'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const STORAGE_KEY = 'govanish_admin_ok'

export default function ReportsDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [unlocked, setUnlocked] = useState(false)
  const [secretInput, setSecretInput] = useState('')
  const [gateMessage, setGateMessage] = useState('')
  const [reports, setReports] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [tab, setTab] = useState<'reports' | 'logs'>('reports')
  const [loading, setLoading] = useState(true)
  const [actionMessage, setActionMessage] = useState('')

  const loadNames = async (ids: string[]) => {
    const unique = Array.from(new Set(ids.filter(Boolean)))
    if (unique.length === 0) return
    const { data } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', unique)
    const map: Record<string, string> = {}
    ;(data || []).forEach((p) => {
      map[p.id] = p.username || 'No username'
    })
    setNames((prev) => ({ ...prev, ...map }))
  }

  const displayUser = (id?: string) => {
    if (!id) return '—'
    const username = names[id]
    if (!username) return id
    return `${username} (${id.slice(0, 8)}…)`
  }

  const loadData = async () => {
    const { data: reportRows } = await supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    setReports(reportRows || [])

    const ids: string[] = []
    ;(reportRows || []).forEach((r: any) => {
      if (r.reporter_id) ids.push(r.reporter_id)
      if (r.reported_id) ids.push(r.reported_id)
    })
    await loadNames(ids)

    const { data: logRows } = await supabase
      .from('safety_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    setLogs(logRows || [])
  }

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setLoading(false)
        setGateMessage('Open Get Started first, then come back to this page.')
        return
      }

      setUser(user)

      const envIds = (process.env.NEXT_PUBLIC_ADMIN_IDS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      if (envIds.includes(user.id)) {
        setUnlocked(true)
        await loadData()
        setLoading(false)
        return
      }

      if (
        typeof window !== 'undefined' &&
        sessionStorage.getItem(STORAGE_KEY) === '1'
      ) {
        setUnlocked(true)
        await loadData()
        setLoading(false)
        return
      }

      setLoading(false)
    }
    init()
  }, [])

  const unlock = async () => {
    setGateMessage('')
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) {
      setGateMessage('Get Started first, then unlock Admin.')
      return
    }

    const res = await fetch('/api/admin/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ secret: secretInput }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setGateMessage(data.error || 'Invalid secret')
      return
    }

    sessionStorage.setItem(STORAGE_KEY, '1')
    setUnlocked(true)
    setLoading(true)
    await loadData()
    setLoading(false)
  }

  const suspendUser = async (
    reportedId: string,
    hours: number | null,
    permanent: boolean
  ) => {
    setActionMessage('')
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) {
      setActionMessage('Session expired')
      return
    }

    const res = await fetch('/api/admin/suspend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        user_id: reportedId,
        hours,
        permanent,
        admin_secret: secretInput || undefined,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setActionMessage(data.error || 'Suspend failed')
      return
    }
    setActionMessage(permanent ? 'Banned' : `Suspended ${hours}h`)
    await loadData()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-zinc-400">Loading admin…</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
          <h1 className="text-xl font-semibold mb-2">Admin</h1>
          <p className="text-sm text-zinc-400 mb-4">{gateMessage}</p>
          <button
            onClick={() => router.push('/auth')}
            className="w-full bg-cyan-500 text-black font-medium py-3 rounded-xl"
          >
            Get Started
          </button>
          <button
            onClick={() => router.push('/')}
            className="w-full mt-3 text-sm text-zinc-500"
          >
            Landing
          </button>
        </div>
      </div>
    )
  }

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <h1 className="text-xl font-semibold mb-2">Admin unlock</h1>
          <p className="text-sm text-zinc-400 mb-4">
            Enter the Admin secret (from Vercel env ADMIN_SECRET). This page
            does not create a username.
          </p>
          <input
            type="password"
            value={secretInput}
            onChange={(e) => setSecretInput(e.target.value)}
            placeholder="Admin secret"
            className="w-full p-3 mb-3 rounded-xl bg-zinc-800 border border-zinc-700"
          />
          <button
            onClick={unlock}
            className="w-full bg-cyan-500 text-black font-medium py-3 rounded-xl"
          >
            Unlock
          </button>
          {gateMessage && (
            <p className="mt-3 text-sm text-red-400 text-center">{gateMessage}</p>
          )}
          <button
            onClick={() => router.push('/home')}
            className="w-full mt-4 text-sm text-zinc-500"
          >
            ← Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Admin · Reports</h1>
          <button
            onClick={() => router.push('/home')}
            className="text-sm text-cyan-400"
          >
            ← Home
          </button>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab('reports')}
            className={`px-4 py-2 rounded-xl text-sm ${
              tab === 'reports' ? 'bg-cyan-500 text-black' : 'bg-zinc-800'
            }`}
          >
            Reports
          </button>
          <button
            onClick={() => setTab('logs')}
            className={`px-4 py-2 rounded-xl text-sm ${
              tab === 'logs' ? 'bg-cyan-500 text-black' : 'bg-zinc-800'
            }`}
          >
            Safety logs
          </button>
        </div>

        {actionMessage && (
          <p className="mb-4 text-sm text-cyan-400">{actionMessage}</p>
        )}

        {tab === 'reports' && (
          <>
            {reports.length === 0 ? (
              <p className="text-zinc-500 text-center mt-16">No reports yet.</p>
            ) : (
              <div className="space-y-4">
                {reports.map((r) => (
                  <div
                    key={r.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5"
                  >
                    <p className="text-sm text-zinc-400 mb-1">
                      Reporter: {displayUser(r.reporter_id)}
                    </p>
                    <p className="text-sm text-zinc-400 mb-1">
                      Reported: {displayUser(r.reported_id)}
                    </p>
                    <p className="text-sm text-zinc-300 mb-1">
                      Type: {r.reason || r.report_type || '—'}
                    </p>
                    <p className="text-xs text-zinc-500 mb-3">
                      {r.created_at
                        ? new Date(r.created_at).toLocaleString()
                        : '—'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => suspendUser(r.reported_id, 24, false)}
                        className="text-xs bg-amber-600 px-3 py-1.5 rounded-lg"
                      >
                        Suspend 24h
                      </button>
                      <button
                        onClick={() => suspendUser(r.reported_id, 168, false)}
                        className="text-xs bg-orange-600 px-3 py-1.5 rounded-lg"
                      >
                        Suspend 7d
                      </button>
                      <button
                        onClick={() => suspendUser(r.reported_id, null, true)}
                        className="text-xs bg-red-600 px-3 py-1.5 rounded-lg"
                      >
                        Ban
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'logs' && (
          <>
            {logs.length === 0 ? (
              <p className="text-zinc-500 text-center mt-16">
                No safety logs found.
              </p>
            ) : (
              <div className="space-y-4">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5"
                  >
                    <p className="text-cyan-400 font-medium mb-2">
                      {log.payload?.action || 'safety_event'}
                    </p>
                    <p className="text-sm text-zinc-400 mb-1">
                      Conversation: {log.conversation_id || '—'}
                    </p>
                    <p className="text-sm text-zinc-400 mb-1">
                      Time:{' '}
                      {log.created_at
                        ? new Date(log.created_at).toLocaleString()
                        : '—'}
                    </p>
                    <pre className="mt-3 text-xs text-zinc-300 bg-black/40 p-3 rounded-xl overflow-x-auto">
                      {JSON.stringify(log.payload || {}, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}