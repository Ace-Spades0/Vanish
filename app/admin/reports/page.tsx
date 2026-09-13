'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

const supabaseUrl = 'https://mjwhgylmdpdmwtwqkptn.supabase.co'
const supabaseAnonKey = 'sb_publishable_4N0JzokcA6cmAlVgEGyMug__ZO5Navb'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export default function ReportsDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [reports, setReports] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const ADMIN_ID = 'de583739-be3d-4937-9bb3-98374c626bb3'

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

      const { data } = await supabase
        .from('reports')
        .select('*')
        .order('created_at', { ascending: false })

      setReports(data || [])
      setLoading(false)
    }

    init()
  }, [])

  const markReviewed = async (id: string) => {
    await supabase
      .from('reports')
      .update({ reviewed: true })
      .eq('id', id)

    setReports((prev) =>
      prev.map((r) => (r.id === id ? { ...r, reviewed: true } : r))
    )
  }

  const deleteReport = async (id: string) => {
    await supabase.from('reports').delete().eq('id', id)
    setReports((prev) => prev.filter((r) => r.id !== id))
  }

  const blockUser = async (reportedUsername: string) => {
    await fetch('/api/block', {
      method: 'POST',
      body: JSON.stringify({
        blocker_id: ADMIN_ID,
        blocked_id: reportedUsername,
      }),
    })

    alert(`User "${reportedUsername}" has been blocked.`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p>Loading reports...</p>
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
          onClick={() => router.push('/')}
          className="bg-zinc-700 hover:bg-zinc-600 text-white px-6 py-3 rounded-xl"
        >
          Back Home
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <h1 className="text-3xl font-bold mb-4">Report Dashboard</h1>
      <p className="text-zinc-400 mb-6">
        All user reports (reviewed + unreviewed)
      </p>

      {reports.length === 0 && (
        <p className="text-zinc-500 text-center mt-20">No reports found.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reports.map((report) => (
          <div
            key={report.id}
            className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 shadow-lg"
          >
            <div className="text-4xl mb-3">⚠️</div>

            <h2 className="text-xl font-bold text-cyan-400 mb-2">
              Report #{report.id}
            </h2>

            <p className="text-sm text-zinc-400 mb-1">
              <span className="text-white">Reporter:</span> {report.reporter_id}
            </p>

            <p className="text-sm text-zinc-400 mb-1">
              <span className="text-white">Reported User:</span>{' '}
              {report.reported_id}
            </p>

            <p className="text-sm text-zinc-400 mb-1">
              <span className="text-white">Reason:</span> {report.reason}
            </p>

            <p className="text-sm text-zinc-400 mb-4">
              <span className="text-white">Time:</span>{' '}
              {new Date(report.created_at).toLocaleString()}
            </p>

            {report.reviewed ? (
              <p className="text-green-400 font-medium mb-4">Reviewed ✔</p>
            ) : (
              <button
                onClick={() => markReviewed(report.id)}
                className="w-full bg-green-600 hover:bg-green-500 text-black py-2 rounded-lg mb-3"
              >
                Mark Reviewed
              </button>
            )}

            <button
              onClick={() => blockUser(report.reported_id)}
              className="w-full bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg mb-3"
            >
              Block User
            </button>

            <button
              onClick={() => deleteReport(report.id)}
              className="w-full bg-zinc-700 hover:bg-zinc-600 text-white py-2 rounded-lg"
            >
              Delete Report
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
