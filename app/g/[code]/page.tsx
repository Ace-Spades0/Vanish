'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function GroupInvitePage() {
  const params = useParams()
  const router = useRouter()
  const codeParam = String(params.code || '').trim()

  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [preview, setPreview] = useState<any>(null)

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth')
        return
      }

      if (!codeParam) {
        setError('Group not available. Invalid link.')
        setLoading(false)
        return
      }

      const code = codeParam.toLowerCase()

      const { data: invite, error: invErr } = await supabase
        .from('vanish_group_invites')
        .select('*')
        .ilike('code', code)
        .maybeSingle()

      if (invErr) {
        setError(invErr.message)
        setLoading(false)
        return
      }

      if (!invite) {
        setError('Group not available. This link may have vanished.')
        setLoading(false)
        return
      }

      if (invite.revoked_at) {
        setError('Group not available. This link was revoked.')
        setLoading(false)
        return
      }

      if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
        setError('Group not available. This link has expired.')
        setLoading(false)
        return
      }

      const { data: group, error: gErr } = await supabase
        .from('vanish_groups')
        .select('*')
        .eq('id', invite.group_id)
        .maybeSingle()

      if (gErr) {
        setError(gErr.message)
        setLoading(false)
        return
      }

      if (!group || group.died_at) {
        setError('Group not available. This group has vanished.')
        setLoading(false)
        return
      }

      if (group.expires_at && new Date(group.expires_at).getTime() <= Date.now()) {
        setError('Group not available. This group has expired.')
        setLoading(false)
        return
      }

      setPreview({ invite, group })
      setLoading(false)
    }

    init()
  }, [codeParam, router])

  const join = async () => {
    if (!accepted || joining) return
    setJoining(true)
    setError('')

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      router.push('/auth')
      return
    }

    const res = await fetch('/api/groups/join', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ code: codeParam }),
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setError(data.error || 'Could not join group')
      setJoining(false)
      return
    }

    router.replace(`/group/${data.group_id}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-zinc-400">Loading invite…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white px-4 py-10">
      <div className="max-w-md mx-auto">
        <button
          type="button"
          onClick={() => router.push('/home')}
          className="inline-flex items-center gap-2 text-sm font-medium text-cyan-400 border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 px-4 py-2.5 rounded-full mb-8 transition"
        >
          ← Back to Home
        </button>

        <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
          <h1 className="text-2xl font-bold mb-2">Vanishing group</h1>
          <p className="text-sm text-zinc-400 mb-4">
            One-time style join. Chats and media here are temporary.
          </p>

          {preview?.group && (
            <p className="text-cyan-400 text-sm mb-4">
              Group id: {String(preview.group.id).slice(0, 8)}…
            </p>
          )}

          {error ? (
            <div className="space-y-4">
              <p className="text-red-400 text-sm">{error}</p>
              <button
                type="button"
                onClick={() => router.push('/home')}
                className="w-full bg-zinc-800 py-3 rounded-xl"
              >
                Go home
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <ul className="text-sm text-zinc-300 space-y-2 list-disc pl-5">
                <li>Messages and media can disappear after the group ends.</li>
                <li>Do not share passwords, codes, or money details.</li>
                <li>You can leave the group. Admin leave can end the group for everyone.</li>
                <li>Report harmful content if needed.</li>
              </ul>
              <p className="text-[11px] font-semibold text-cyan-300/95 uppercase tracking-wide leading-relaxed">
                NO ONLINE SERVICE CAN GUARANTEE PERFECT SECURITY. DO NOT SHARE
                SECRETS YOU CANNOT AFFORD TO EXPOSE.
              </p>

              <label className="flex items-start gap-3 text-sm text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  className="mt-1"
                />
                <span>I understand and want to join this vanishing group.</span>
              </label>

              <button
                type="button"
                disabled={!accepted || joining}
                onClick={join}
                className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-semibold py-3 rounded-xl"
              >
                {joining ? 'Joining…' : 'Join group'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}