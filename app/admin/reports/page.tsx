'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const ADMIN_IDS = ['a78d8a8e-de03-4159-a3c2-b5788e7cf5b7']

export default function ReportsDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [reports, setReports] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [appeals, setAppeals] = useState<any[]>([])
  const [appealNames, setAppealNames] = useState<Record<string, string>>({})
  const [names, setNames] = useState<Record<string, string>>({})
  const [tab, setTab] = useState<'reports' | 'logs' | 'appeals'>('reports')
  const [loading, setLoading] = useState(true)
  const [actionMessage, setActionMessage] = useState('')
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [openSnapshotId, setOpenSnapshotId] = useState<string | null>(null)
  const [appealBusy, setAppealBusy] = useState<string | null>(null)

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

  const riskColor = (risk?: string) => {
    if (risk === 'high') return 'text-red-400'
    if (risk === 'medium') return 'text-yellow-400'
    if (risk === 'low') return 'text-emerald-400'
    return 'text-zinc-400'
  }

  const loadReports = async () => {
    const { data } = await supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    const list = data || []
    setReports(list)
    const ids: string[] = []
    list.forEach((r) => {
      if (r.reporter_id) ids.push(r.reporter_id)
      if (r.reported_id) ids.push(r.reported_id)
    })
    await loadNames(ids)
  }

  const loadLogs = async () => {
    const { data } = await supabase
      .from('safety_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    setLogs(data || [])
  }

  const loadAppeals = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/appeals', {
      headers: { Authorization: `Bearer ${session?.access_token || ''}` },
    })
    const data = await res.json()
    if (data.error) {
      setActionMessage(data.error)
      return
    }
    setAppeals(data.appeals || [])
    setAppealNames(data.names || {})
  }

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth')
        return
      }
      if (!ADMIN_IDS.includes(user.id)) {
        router.push('/home')
        return
      }
      setUser(user)
      await loadReports()
      await loadLogs()
      await loadAppeals()
      setLoading(false)
    }
    init()
  }, [])

  const runAiReview = async (reportId: string) => {
    setReviewingId(reportId)
    setActionMessage('')
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/ai-review', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({ report_id: reportId }),
    })
    const data = await res.json()
    if (data.error) setActionMessage(data.error)
    else {
      setActionMessage(`AI: ${data.risk} (${data.engine})`)
      await loadReports()
    }
    setReviewingId(null)
  }

  const setSuspension = async (
    profileId: string,
    mode: 'timed' | 'permanent' | 'clear',
    hours?: number
  ) => {
    setActionMessage('')
    let status = 'active'
    let suspended_until: string | null = null
    if (mode === 'permanent') status = 'banned'
    else if (mode === 'timed') {
      status = 'suspended'
      suspended_until = new Date(
        Date.now() + (hours || 24) * 60 * 60 * 1000
      ).toISOString()
    }
    const { error } = await supabase
      .from('profiles')
      .update({ status, suspended_until })
      .eq('id', profileId)
    if (error) setActionMessage(error.message)
    else
      setActionMessage(
        mode === 'clear'
          ? 'User unsuspended'
          : mode === 'permanent'
            ? 'User banned'
            : `Suspended ${hours}h`
      )
  }

  const decideAppeal = async (appealId: string, action: 'approve' | 'reject') => {
    setAppealBusy(appealId)
    setActionMessage('')
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/appeals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({ appeal_id: appealId, action }),
    })
    const data = await res.json()
    if (data.error) setActionMessage(data.error)
    else {
      setActionMessage(action === 'approve' ? 'Appeal approved — user unsuspended' : 'Appeal rejected')
      await loadAppeals()
    }
    setAppealBusy(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-zinc-400">Loading admin…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Admin</h1>
          <button onClick={() => router.push('/home')} className="text-sm text-cyan-400">
            ← Home
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {(['reports', 'appeals', 'logs'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-4 py-2 rounded-xl text-sm font-medium capitalize ${
                tab === k ? 'bg-cyan-500 text-black' : 'bg-zinc-800'
              }`}
            >
              {k}
            </button>
          ))}
        </div>

        {actionMessage && (
          <p className="mb-4 text-sm text-cyan-400">{actionMessage}</p>
        )}

        {tab === 'appeals' && (
          <>
            {appeals.length === 0 ? (
              <p className="text-zinc-500 text-center mt-16">No appeals yet.</p>
            ) : (
              <div className="space-y-4">
                {appeals.map((a) => (
                  <div
                    key={a.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5"
                  >
                    <p className="text-xs text-zinc-500 mb-1">
                      {a.created_at
                        ? new Date(a.created_at).toLocaleString()
                        : '—'}{' '}
                      · <span className="text-cyan-400">{a.status}</span>
                    </p>
                    <p className="text-sm mb-2">
                      User:{' '}
                      <span className="text-yellow-400">
                        {appealNames[a.user_id] || a.user_id}
                      </span>
                    </p>
                    <p className="text-sm text-zinc-200 whitespace-pre-wrap mb-3">
                      {a.message}
                    </p>
                    {a.admin_note && (
                      <p className="text-xs text-zinc-400 mb-2">Note: {a.admin_note}</p>
                    )}
                    {a.status === 'pending' && (
                      <div className="flex gap-2">
                        <button
                          disabled={appealBusy === a.id}
                          onClick={() => decideAppeal(a.id, 'approve')}
                          className="text-xs font-semibold bg-emerald-600 px-3 py-1.5 rounded-lg disabled:opacity-50"
                        >
                          Approve (unsuspend)
                        </button>
                        <button
                          disabled={appealBusy === a.id}
                          onClick={() => decideAppeal(a.id, 'reject')}
                          className="text-xs font-semibold bg-red-700 px-3 py-1.5 rounded-lg disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
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
                      {r.created_at
                        ? new Date(r.created_at).toLocaleString()
                        : '—'}
                    </p>
                    <p className="text-sm mb-1">
                      <span className="text-zinc-500">Reporter: </span>
                      <span className="text-cyan-400">
                        {displayUser(r.reporter_id)}
                      </span>
                    </p>
                    <p className="text-sm mb-2">
                      <span className="text-zinc-500">Reported: </span>
                      <span className="text-yellow-400">
                        {displayUser(r.reported_id)}
                      </span>
                    </p>
                    <p className="text-sm text-zinc-200 mb-2 whitespace-pre-wrap">
                      {r.reason}
                    </p>
                    <div className="mb-3 p-3 rounded-xl bg-black/40 border border-zinc-800">
                      <p className={`text-sm font-medium ${riskColor(r.ai_risk)}`}>
                        AI: {r.ai_status === 'done' ? r.ai_risk || '—' : r.ai_status || 'pending'}
                      </p>
                      {r.ai_summary && (
                        <p className="text-xs text-zinc-400 mt-1 whitespace-pre-wrap">
                          {r.ai_summary}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-2">
                        <button
                          type="button"
                          disabled={reviewingId === r.id}
                          onClick={() => runAiReview(r.id)}
                          className="text-xs font-semibold bg-cyan-600 px-3 py-1.5 rounded-lg disabled:opacity-50"
                        >
                          {reviewingId === r.id ? '…' : 'Re-run AI'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenSnapshotId((id) => (id === r.id ? null : r.id))
                          }
                          className="text-xs font-semibold bg-zinc-700 px-3 py-1.5 rounded-lg"
                        >
                          Snapshot
                        </button>
                      </div>
                      {openSnapshotId === r.id && (
                        <pre className="mt-2 text-[10px] text-zinc-400 overflow-x-auto max-h-40">
                          {JSON.stringify(r.message_snapshot || [], null, 2)}
                        </pre>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSuspension(r.reported_id, 'timed', 24)}
                        className="text-xs bg-yellow-700 px-2 py-1 rounded-lg"
                      >
                        Suspend 24h
                      </button>
                      <button
                        type="button"
                        onClick={() => setSuspension(r.reported_id, 'timed', 168)}
                        className="text-xs bg-orange-700 px-2 py-1 rounded-lg"
                      >
                        Suspend 7d
                      </button>
                      <button
                        type="button"
                        onClick={() => setSuspension(r.reported_id, 'permanent')}
                        className="text-xs bg-red-700 px-2 py-1 rounded-lg"
                      >
                        Ban
                      </button>
                      <button
                        type="button"
                        onClick={() => setSuspension(r.reported_id, 'clear')}
                        className="text-xs bg-emerald-700 px-2 py-1 rounded-lg"
                      >
                        Unsuspend
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
              <p className="text-zinc-500 text-center mt-16">No safety logs.</p>
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
                    <pre className="text-xs text-zinc-300 bg-black/40 p-3 rounded-xl overflow-x-auto">
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