'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// PUT YOUR CURRENT ADMIN USER UUID HERE
const ADMIN_ID = 'a78d8a8e-de03-4159-a3c2-b5788e7cf5b7'

export default function ReportsDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [reports, setReports] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [tab, setTab] = useState<'reports' | 'logs'>('reports')
  const [loading, setLoading] = useState(true)
  const [actionMessage, setActionMessage] = useState('')

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
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

      setReports(reportData || [])
      setLogs(logData || [])
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

  const setUserStatus = async (userId: string, status: 'suspended' | 'banned' | 'active') => {
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
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p>Loading admin panel...</p>
      </div>
    )
  }

  if (user?.id !== ADMIN_ID) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6 text-center">
        <div className="text-6xl mb-4">⛔</div>
        <h1 className="text-3xl font-bold mb-2">Access Denied</h1>
        <p className="text-zinc-400 mb-6">
          You do not have permission to view this page.
        </p>
        <button
          onClick={() => router.push('/home')}
          className="bg-zinc-700 hover:bg-zinc-600 text-white px-6 py-3 rounded-xl"
        >
          Back Home
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-1">Admin Panel</h1>
            <p className="text-zinc-400 text-sm">
              Review reports and safety events (cleared chats, flags)
            </p>
          </div>
          <button
            onClick={() => router.push('/home')}
            className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-4 py-2 rounded-xl text-sm"
          >
            Back to Home
          </button>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab('reports')}
            className={`px-4 py-2 rounded-xl text-sm border ${
              tab === 'reports'
                ? 'bg-cyan-500 text-black border-cyan-400'
                : 'bg-zinc-900 text-white border-zinc-700'
            }`}
          >
            Reports ({reports.length})
          </button>
          <button
            onClick={() => setTab('logs')}
            className={`px-4 py-2 rounded-xl text-sm border ${
              tab === 'logs'
                ? 'bg-cyan-500 text-black border-cyan-400'
                : 'bg-zinc-900 text-white border-zinc-700'
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {reports.map((report) => (
                  <div
                    key={report.id}
                    className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 shadow-lg"
                  >
                    <div className="text-3xl mb-3">⚠️</div>
                    <h2 className="text-lg font-bold text-cyan-400 mb-3">
                      Report
                    </h2>

                    <p className="text-sm text-zinc-400 mb-1 break-all">
                      <span className="text-white">Reporter:</span> {report.reporter_id}
                    </p>
                    <p className="text-sm text-zinc-400 mb-1 break-all">
                      <span className="text-white">Reported:</span> {report.reported_id}
                    </p>
                    <p className="text-sm text-zinc-400 mb-1">
                      <span className="text-white">Reason:</span> {report.reason || '—'}
                    </p>
                    <p className="text-sm text-zinc-400 mb-4">
                      <span className="text-white">Time:</span>{' '}
                      {report.created_at
                        ? new Date(report.created_at).toLocaleString()
                        : '—'}
                    </p>

                    {report.reviewed ? (
                      <p className="text-green-400 font-medium mb-3">Reviewed ✔</p>
                    ) : (
                      <button
                        onClick={() => markReviewed(report.id)}
                        className="w-full bg-green-600 hover:bg-green-500 text-black py-2 rounded-lg mb-2"
                      >
                        Mark Reviewed
                      </button>
                    )}

                    <button
                      onClick={() => setUserStatus(report.reported_id, 'suspended')}
                      className="w-full bg-yellow-600 hover:bg-yellow-500 text-black py-2 rounded-lg mb-2"
                    >
                      Suspend User
                    </button>

                    <button
                      onClick={() => setUserStatus(report.reported_id, 'banned')}
                      className="w-full bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg mb-2"
                    >
                      Ban User
                    </button>

                    <button
                      onClick={() => setUserStatus(report.reported_id, 'active')}
                      className="w-full bg-zinc-700 hover:bg-zinc-600 text-white py-2 rounded-lg mb-2"
                    >
                      Set Active
                    </button>

                    <button
                      onClick={() => deleteReport(report.id)}
                      className="w-full bg-zinc-800 hover:bg-zinc-700 text-white py-2 rounded-lg border border-zinc-700"
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
                No safety logs found. Cleared chats and flagged events will appear here.
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