'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const ADMIN_ID = 'a78d8a8e-de03-4159-a3c2-b5788e7cf5b7'

export default function ReportsDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
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

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth')
        return
      }
      setUser(user)
      if (user.id !== ADMIN_ID) {
        setLoading(false)
        return
      }

      const { data: reportData } = await supabase
        .from('reports')
        .select('*')
        .order('created_at', { ascending: false })

      const { data: logData } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      const list = reportData || []
      setReports(list)
      setLogs(logData || [])
      const ids = list.flatMap((r) => [r.reporter_id, r.reported_id])
      await loadNames(ids)
      setLoading(false)
    }
    init()
  }, [])

  const markReviewed = async (id: string) => {
    const { error } = await supabase
      .from('reports')
      .update({ reviewed: true })
      .eq('id', id)
    if (error) {
      setActionMessage(error.message)
      return
    }
    setReports((prev) =>
      prev.map((r) => (r.id === id ? { ...r, reviewed: true } : r))
    )
    setActionMessage('Report marked as reviewed')
  }

  const deleteReport = async (id: string) => {
    const { error } = await supabase.from('reports').delete().eq('id', id)
    if (error) {
      setActionMessage(error.message)
      return
    }
    setReports((prev) => prev.filter((r) => r.id !== id))
    setActionMessage('Report deleted')
  }

  const setUserStatus = async (
    userId: string,
    status: 'suspended' | 'banned' | 'active'
  ) => {
    const { error } = await supabase
      .from('profiles')
      .update({ status })
      .eq('id', userId)
    if (error) {
      setActionMessage(error.message)
      return
    }
    setActionMessage(`User set to ${status}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#05070c] text-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (user?.id !== ADMIN_ID) {
    return (
      <div className="min-h-screen bg-[#05070c] text-white flex flex-col items-center justify-center px-6 text-center">
        <div className="text-6xl mb-4">⛔</div>
        <h1 className="text-3xl font-bold mb-2">Access Denied</h1>
        <p className="text-zinc-400 mb-6">
          You do not have permission to view this page.
        </p>
        <button
          onClick={() => router.push('/home')}
          className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-3 rounded-xl border border-zinc-700"
        >
          Back Home
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#05070c] text-white relative overflow-hidden">
      {/* Platform atmosphere — purple + cyan for admin */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-purple-600/15 blur-[130px] rounded-full" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-cyan-500/10 blur-[120px] rounded-full" />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              'radial-gradient(circle, rgba(168,85,247,0.9) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
        />
      </div>

      <div className="relative z-10 p-6 max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-purple-300/70 mb-2">
              Go Vanish · Internal
            </p>
            <h1 className="text-3xl font-bold mb-1">Admin Panel</h1>
            <p className="text-zinc-400 text-sm">
              Reports and safety events (cleared chats, flags)
            </p>
          </div>
          <button
            onClick={() => router.push('/home')}
            className="inline-flex items-center gap-2 text-sm font-medium text-cyan-400 border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 px-4 py-2.5 rounded-full transition self-start"
          >
            ← Back to Home
          </button>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab('reports')}
            className={`px-4 py-2 rounded-xl text-sm border transition ${
              tab === 'reports'
                ? 'bg-cyan-500 text-black border-cyan-400'
                : 'bg-zinc-900/80 text-white border-zinc-700 hover:border-zinc-500'
            }`}
          >
            Reports ({reports.length})
          </button>
          <button
            onClick={() => setTab('logs')}
            className={`px-4 py-2 rounded-xl text-sm border transition ${
              tab === 'logs'
                ? 'bg-cyan-500 text-black border-cyan-400'
                : 'bg-zinc-900/80 text-white border-zinc-700 hover:border-zinc-500'
            }`}
          >
            Safety logs ({logs.length})
          </button>
        </div>

        {actionMessage && (
          <p className="mb-4 text-sm text-cyan-400">{actionMessage}</p>
        )}

        {tab === 'reports' && (
          <>
            {reports.length === 0 ? (
              <p className="text-zinc-500 text-center mt-20">No reports found.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {reports.map((report) => (
                  <div
                    key={report.id}
                    className="bg-zinc-900/70 backdrop-blur-sm p-5 rounded-2xl border border-zinc-800/80 shadow-lg"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xl">⚠️</span>
                      <h2 className="text-base font-bold text-cyan-400">Report</h2>
                      {report.reviewed && (
                        <span className="ml-auto text-[10px] text-green-400 border border-green-800 px-2 py-0.5 rounded-full">
                          Reviewed
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-zinc-400 mb-2 break-all">
                      <span className="text-zinc-200">Reporter:</span>{' '}
                      {displayUser(report.reporter_id)}
                    </p>
                    <p className="text-sm text-zinc-400 mb-2 break-all">
                      <span className="text-zinc-200">Reported:</span>{' '}
                      {displayUser(report.reported_id)}
                    </p>
                    <p className="text-sm text-zinc-400 mb-1">
                      <span className="text-zinc-200">Reason:</span>{' '}
                      {report.reason || '—'}
                    </p>
                    <p className="text-xs text-zinc-500 mb-4">
                      {report.created_at
                        ? new Date(report.created_at).toLocaleString()
                        : '—'}
                    </p>

                    {!report.reviewed && (
                      <button
                        onClick={() => markReviewed(report.id)}
                        className="w-full bg-green-600 hover:bg-green-500 text-black py-2 rounded-lg mb-2 text-sm font-medium"
                      >
                        Mark Reviewed
                      </button>
                    )}
                    <button
                      onClick={() =>
                        setUserStatus(report.reported_id, 'suspended')
                      }
                      className="w-full bg-yellow-600 hover:bg-yellow-500 text-black py-2 rounded-lg mb-2 text-sm font-medium"
                    >
                      Suspend User
                    </button>
                    <button
                      onClick={() => setUserStatus(report.reported_id, 'banned')}
                      className="w-full bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg mb-2 text-sm font-medium"
                    >
                      Ban User
                    </button>
                    <button
                      onClick={() => setUserStatus(report.reported_id, 'active')}
                      className="w-full bg-zinc-700 hover:bg-zinc-600 text-white py-2 rounded-lg mb-2 text-sm"
                    >
                      Set Active
                    </button>
                    <button
                      onClick={() => deleteReport(report.id)}
                      className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2 rounded-lg border border-zinc-700 text-sm"
                    >
                      Delete Report
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'logs' && (
          <>
            {logs.length === 0 ? (
              <p className="text-zinc-500 text-center mt-20">
                No safety logs yet. Cleared chats and flags appear here.
              </p>
            ) : (
              <div className="space-y-4">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="bg-zinc-900/70 backdrop-blur-sm border border-zinc-800/80 rounded-2xl p-5"
                  >
                    <p className="text-cyan-400 font-medium mb-2">
                      {log.payload?.action || 'safety_event'}
                    </p>
                    <p className="text-sm text-zinc-400 mb-1">
                      Conversation: {log.conversation_id || '—'}
                    </p>
                    <p className="text-sm text-zinc-500 mb-1">
                      {log.created_at
                        ? new Date(log.created_at).toLocaleString()
                        : '—'}
                    </p>
                    <pre className="mt-3 text-xs text-zinc-300 bg-black/50 p-3 rounded-xl overflow-x-auto border border-zinc-800">
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