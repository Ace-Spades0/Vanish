'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'
import { getLang, setLang, translations, type Lang } from '@/lib/i18n'

const ADMIN_ID = 'a78d8a8e-de03-4159-a3c2-b5788e7cf5b7'

function getExpiryLabel(profile: any): string | null {
  if (!profile?.username) return null
  if (profile.is_permanent_username) return 'Permanent'
  if (!profile.username_claimed_at) return null
  const end =
    new Date(profile.username_claimed_at).getTime() + 24 * 60 * 60 * 1000
  const msLeft = end - Date.now()
  if (msLeft <= 0) return 'Expired — pick a new username'
  const hours = Math.floor(msLeft / (1000 * 60 * 60))
  const mins = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60))
  if (hours >= 1) return `Expires in ${hours}h ${mins}m`
  return `Expires in ${mins}m`
}

export default function HomePage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [blockedUsers, setBlockedUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showBlockedModal, setShowBlockedModal] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [lang, setLangState] = useState<Lang>('en')
  const [expiryLabel, setExpiryLabel] = useState<string | null>(null)
  const [inviteUrl, setInviteUrl] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [inviteMsg, setInviteMsg] = useState('')
  const [creatingInvite, setCreatingInvite] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const router = useRouter()
  const t = translations[lang]

  const loadBlockedUsers = async (userId: string) => {
    const { data: blocks } = await supabase
      .from('blocks')
      .select('blocked_id')
      .eq('blocker_id', userId)
    if (!blocks?.length) {
      setBlockedUsers([])
      return
    }
    const ids = blocks.map((b) => b.blocked_id)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', ids)
    setBlockedUsers(profiles || [])
  }

  useEffect(() => {
    setLangState(getLang())
    const loadData = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth')
        return
      }
      setUser(user)

      let { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      if (user.id === ADMIN_ID) {
        const needsRepair =
          !profileData ||
          profileData.username !== 'LESTAT' ||
          profileData.is_permanent_username !== true ||
          profileData.is_offline === true
        if (needsRepair) {
          await supabase.from('profiles').upsert({
            id: user.id,
            username: 'LESTAT',
            is_permanent_username: true,
            is_offline: false,
            username_claimed_at: new Date().toISOString(),
            status: 'active',
          })
          const { data: fixed } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle()
          profileData = fixed
        }
      }

      if (
        profileData?.status === 'suspended' ||
        profileData?.status === 'banned'
      ) {
        await supabase.auth.signOut()
        router.push('/auth')
        return
      }

      if (profileData?.username) {
        if (profileData.is_permanent_username) setProfile(profileData)
        else if (profileData.username_claimed_at) {
          const hoursPassed =
            (Date.now() - new Date(profileData.username_claimed_at).getTime()) /
            3600000
          setProfile(hoursPassed < 24 ? profileData : null)
        } else setProfile(null)
      } else setProfile(null)

      setExpiryLabel(getExpiryLabel(profileData))
      await loadBlockedUsers(user.id)
      setLoading(false)
    }
    loadData()
  }, [])

  useEffect(() => {
    if (!profile) return
    const id = setInterval(() => setExpiryLabel(getExpiryLabel(profile)), 60000)
    return () => clearInterval(id)
  }, [profile])

  const changeLang = (next: Lang) => {
    setLang(next)
    setLangState(next)
  }

  const createInvite = async () => {
    setInviteMsg('')
    setInviteUrl('')
    setInviteCode('')
    setCreatingInvite(true)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        setInviteMsg('Please login again')
        return
      }
      const res = await fetch('/api/create-invite', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const text = await res.text()
      let data: any = {}
      try {
        data = JSON.parse(text)
      } catch {
        setInviteMsg(`Error ${res.status}`)
        return
      }
      if (!res.ok || data.error) {
        setInviteMsg(data.error || `Failed ${res.status}`)
        return
      }
      const full = `${window.location.origin}${data.url}`
      setInviteUrl(full)
      setInviteCode(data.code || '')
      try {
        await navigator.clipboard.writeText(full)
        setInviteMsg('Link copied')
      } catch {
        setInviteMsg('Link ready')
      }
    } catch (e: any) {
      setInviteMsg(e?.message || 'Error')
    } finally {
      setCreatingInvite(false)
    }
  }

  const copyInvite = async () => {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setInviteMsg('Link copied')
    } catch {
      setInviteMsg('Copy failed')
    }
  }

  const revokeInvite = async () => {
    if (!inviteCode) return
    setRevoking(true)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch('/api/revoke-invite', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: inviteCode }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setInviteMsg(data.error || 'Failed')
        return
      }
      setInviteUrl('')
      setInviteCode('')
      setInviteMsg('Link revoked')
    } finally {
      setRevoking(false)
    }
  }

  const unblockUser = async (blockedId: string) => {
    if (!user) return
    await supabase
      .from('blocks')
      .delete()
      .eq('blocker_id', user.id)
      .eq('blocked_id', blockedId)
    setBlockedUsers((prev) => prev.filter((u) => u.id !== blockedId))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-cyan-500/10 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-md mx-auto px-5 min-h-screen flex flex-col">
        {/* top bar */}
        <div className="flex items-center justify-between pt-5 pb-2">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="Go Vanish" width={28} height={28} priority />
            <span className="text-sm font-semibold">{t.appName}</span>
          </div>
          <button
            onClick={() => changeLang(lang === 'en' ? 'sw' : 'en')}
            className="text-xs text-zinc-500 border border-zinc-800 px-2.5 py-1 rounded-full"
          >
            {lang === 'en' ? 'SW' : 'EN'}
          </button>
        </div>

        {/* identity */}
        <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
          <div className="text-5xl mb-5">{profile?.avatar_icon || '🎭'}</div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 mb-2">
            Username
          </p>
          <h1 className="text-4xl font-bold text-cyan-400 tracking-tight">
            {profile?.username || t.noUsername}
          </h1>
          {expiryLabel && (
            <p className="text-sm text-zinc-400 mt-2">{expiryLabel}</p>
          )}
          {profile?.bio && (
            <p className="text-sm text-zinc-500 mt-2 max-w-[240px]">{profile.bio}</p>
          )}
          {profile?.is_offline && (
            <p className="text-xs text-amber-400 mt-2">Offline in search</p>
          )}

          {/* primary */}
          <div className="w-full mt-10">
            {!profile?.username ? (
              <button
                onClick={() => router.push('/username')}
                className="w-full py-4 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold transition"
              >
                {t.pickUsername}
              </button>
            ) : (
              <button
                onClick={() => router.push('/search')}
                className="w-full py-4 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold transition shadow-[0_0_30px_rgba(34,211,238,0.2)]"
              >
                Start a vanishing chat
              </button>
            )}
          </div>

          {/* 2x2 clear tabs */}
          {profile?.username && (
            <div className="w-full grid grid-cols-2 gap-3 mt-6">
              <button
                onClick={() => setShowInvite((v) => !v)}
                className={`rounded-2xl border p-4 text-left transition ${
                  showInvite
                    ? 'border-cyan-500/50 bg-cyan-500/10'
                    : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600'
                }`}
              >
                <p className="text-sm font-medium text-white">Vanish link</p>
                <p className="text-xs text-zinc-500 mt-1">
                  One chat with you, then the link dies
                </p>
              </button>

              <button
                onClick={() => router.push('/letters')}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 p-4 text-left transition"
              >
                <p className="text-sm font-medium text-white">Letters</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Send or read a one-time note
                </p>
              </button>

              <button
                onClick={() => router.push('/profile')}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 p-4 text-left transition"
              >
                <p className="text-sm font-medium text-white">My account</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Profile, logout, delete account
                </p>
              </button>

              <button
                onClick={() => setShowBlockedModal(true)}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 p-4 text-left transition"
              >
                <p className="text-sm font-medium text-white">Blocked</p>
                <p className="text-xs text-zinc-500 mt-1">
                  {blockedUsers.length === 0
                    ? 'No blocked users'
                    : `${blockedUsers.length} blocked`}
                </p>
              </button>
            </div>
          )}

          {/* vanish link panel */}
          {showInvite && profile?.username && (
            <div className="w-full mt-4 rounded-2xl border border-cyan-500/20 bg-zinc-900/80 p-4 text-left">
              <p className="text-sm font-medium mb-1">Your vanish link</p>
              <p className="text-xs text-zinc-500 mb-3">
                Share this so someone can open one chat with you. After they open it, the link stops working.
              </p>
              {!inviteUrl ? (
                <button
                  onClick={createInvite}
                  disabled={creatingInvite}
                  className="w-full py-3 rounded-xl bg-cyan-500 text-black text-sm font-medium disabled:opacity-50"
                >
                  {creatingInvite ? 'Creating…' : 'Create link'}
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] font-mono text-cyan-300 break-all bg-black/40 rounded-xl p-3 border border-zinc-800">
                    {inviteUrl}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={copyInvite}
                      className="flex-1 py-2 rounded-xl bg-zinc-800 text-sm"
                    >
                      Copy
                    </button>
                    <button
                      onClick={revokeInvite}
                      disabled={revoking}
                      className="flex-1 py-2 rounded-xl border border-red-900 text-red-300 text-sm disabled:opacity-50"
                    >
                      {revoking ? '…' : 'Revoke'}
                    </button>
                  </div>
                </div>
              )}
              {inviteMsg && (
                <p className="text-xs text-cyan-400 mt-2 text-center">{inviteMsg}</p>
              )}
            </div>
          )}
        </div>

        {/* footer — legal + admin only */}
        <div className="pb-8 pt-2 flex flex-wrap items-center justify-center gap-3 text-xs text-zinc-600">
          {user?.id === ADMIN_ID && (
            <button
              onClick={() => router.push('/admin/reports')}
              className="hover:text-purple-400"
            >
              Admin
            </button>
          )}
          <button onClick={() => router.push('/terms')} className="hover:text-zinc-400">
            Terms
          </button>
          <button onClick={() => router.push('/privacy')} className="hover:text-zinc-400">
            Privacy
          </button>
        </div>
      </div>

      {showBlockedModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 w-full max-w-sm">
            <div className="flex justify-between mb-4">
              <p className="font-medium">Blocked users</p>
              <button onClick={() => setShowBlockedModal(false)} className="text-zinc-500">
                Close
              </button>
            </div>
            {blockedUsers.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-6">None</p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {blockedUsers.map((u) => (
                  <div key={u.id} className="flex justify-between text-sm py-2">
                    <span>{u.username || 'Unknown'}</span>
                    <button
                      onClick={() => unblockUser(u.id)}
                      className="text-cyan-400 text-xs"
                    >
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}