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
  const [deleting, setDeleting] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
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

    if (!blocks || blocks.length === 0) {
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
        if (profileData.is_permanent_username) {
          setProfile(profileData)
        } else if (profileData.username_claimed_at) {
          const hoursPassed =
            (Date.now() - new Date(profileData.username_claimed_at).getTime()) /
            (1000 * 60 * 60)
          if (hoursPassed < 24) setProfile(profileData)
          else setProfile(null)
        } else {
          setProfile(null)
        }
      } else {
        setProfile(null)
      }

      setExpiryLabel(getExpiryLabel(profileData))
      await loadBlockedUsers(user.id)
      setLoading(false)
    }

    loadData()
  }, [])

  useEffect(() => {
    if (!profile) return
    const tick = () => setExpiryLabel(getExpiryLabel(profile))
    tick()
    const id = setInterval(tick, 60 * 1000)
    return () => clearInterval(id)
  }, [profile])

  const changeLang = (next: Lang) => {
    setLang(next)
    setLangState(next)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
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
        setInviteMsg(`Invite API error (${res.status})`)
        return
      }

      if (!res.ok || data.error) {
        setInviteMsg(data.error || `Failed (${res.status})`)
        return
      }

      const full = `${window.location.origin}${data.url}`
      setInviteUrl(full)
      setInviteCode(data.code || '')

      try {
        await navigator.clipboard.writeText(full)
        setInviteMsg('Link copied')
      } catch {
        setInviteMsg('Invite ready')
      }
    } catch (e: any) {
      setInviteMsg(e?.message || 'Something went wrong')
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
    setInviteMsg('')

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        setInviteMsg('Please login again')
        return
      }

      const res = await fetch('/api/revoke-invite', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: inviteCode }),
      })

      const text = await res.text()
      let data: any = {}
      try {
        data = JSON.parse(text)
      } catch {
        setInviteMsg(`Revoke error (${res.status})`)
        return
      }

      if (!res.ok || data.error) {
        setInviteMsg(data.error || `Failed (${res.status})`)
        return
      }

      setInviteUrl('')
      setInviteCode('')
      setInviteMsg('Invite revoked')
    } catch (e: any) {
      setInviteMsg(e?.message || 'Something went wrong')
    } finally {
      setRevoking(false)
    }
  }

  const unblockUser = async (blockedId: string) => {
    if (!user) return
    const { error } = await supabase
      .from('blocks')
      .delete()
      .eq('blocker_id', user.id)
      .eq('blocked_id', blockedId)
    if (error) {
      alert(error.message)
      return
    }
    setBlockedUsers((prev) => prev.filter((u) => u.id !== blockedId))
  }

  const deleteAccount = async () => {
    setDeleting(true)
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) {
      setDeleting(false)
      return
    }
    const res = await fetch('/api/delete-account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const data = await res.json()
    if (data.error) {
      alert(data.error)
      setDeleting(false)
      return
    }
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#03050a] text-white flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-cyan-400/80 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#03050a] text-white relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-15%] left-1/2 -translate-x-1/2 w-[640px] h-[640px] bg-cyan-500/[0.08] blur-[130px] rounded-full" />
        <div className="absolute bottom-0 right-0 w-[300px] h-[300px] bg-blue-700/[0.06] blur-[100px] rounded-full" />
      </div>

      {/* Top */}
      <header className="relative z-20 flex items-center justify-between px-5 py-4 max-w-md mx-auto">
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="Go Vanish" width={28} height={28} priority />
          <span className="text-sm font-semibold tracking-tight">{t.appName}</span>
        </div>
        <div className="flex gap-1">
          {(['en', 'sw'] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => changeLang(l)}
              className={`text-[10px] uppercase px-2 py-1 rounded-full border ${
                lang === l
                  ? 'bg-cyan-500 text-black border-cyan-400'
                  : 'border-zinc-700 text-zinc-500'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </header>

      <main className="relative z-10 max-w-md mx-auto px-5 pb-16">
        {/* CENTER: identity — not a button */}
        <div className="text-center pt-8 pb-10">
          <div className="mx-auto mb-5 h-[72px] w-[72px] rounded-full bg-zinc-900/90 border border-cyan-500/20 flex items-center justify-center text-3xl shadow-[0_0_50px_rgba(34,211,238,0.15)]">
            {profile?.avatar_icon || '🎭'}
          </div>

          <p className="text-[10px] tracking-[0.3em] uppercase text-zinc-500 mb-2">
            You are
          </p>
          <h1 className="text-4xl font-bold text-cyan-400 tracking-tight">
            {profile?.username || t.noUsername}
          </h1>

          {expiryLabel && (
            <p
              className={`text-xs mt-2 ${
                expiryLabel === 'Permanent' ? 'text-purple-300' : 'text-zinc-500'
              }`}
            >
              {expiryLabel}
            </p>
          )}

          {profile?.bio && (
            <p className="text-sm text-zinc-400 mt-3 max-w-[240px] mx-auto">
              {profile.bio}
            </p>
          )}

          <div className="mt-4 flex justify-center gap-2 flex-wrap">
            <span className="text-[10px] px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">
              Private
            </span>
            {profile?.is_permanent_username && (
              <span className="text-[10px] px-2.5 py-1 rounded-full bg-purple-950/50 border border-purple-800 text-purple-300">
                Permanent
              </span>
            )}
            {profile?.is_offline && (
              <span className="text-[10px] px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-700 text-amber-300">
                Offline
              </span>
            )}
          </div>
        </div>

        {/* ONE primary action */}
        <div className="mb-8">
          {!profile?.username ? (
            <button
              onClick={() => router.push('/username')}
              className="w-full py-4 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-base shadow-[0_0_40px_rgba(34,211,238,0.25)] transition"
            >
              {t.pickUsername}
            </button>
          ) : (
            <button
              onClick={() => router.push('/search')}
              className="w-full py-4 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-base shadow-[0_0_40px_rgba(34,211,238,0.25)] transition"
            >
              Start a vanishing chat
            </button>
          )}
        </div>

        {/* Compact icon row — not a button list */}
        {profile?.username && (
          <div className="flex justify-center gap-3 mb-6">
            {[
              {
                label: 'Invite',
                icon: '🔗',
                onClick: () => setShowInvite((v) => !v),
                active: showInvite,
              },
              {
                label: 'Letters',
                icon: '✉️',
                onClick: () => router.push('/letters'),
              },
              {
                label: 'Profile',
                icon: '🎭',
                onClick: () => router.push('/profile'),
              },
              {
                label: 'Blocked',
                icon: '🚫',
                onClick: () => setShowBlockedModal(true),
                badge: blockedUsers.length,
              },
            ].map((item) => (
              <button
                key={item.label}
                onClick={item.onClick}
                className={`relative flex flex-col items-center justify-center w-[68px] h-[68px] rounded-2xl border transition ${
                  item.active
                    ? 'border-cyan-500/50 bg-cyan-500/10'
                    : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                }`}
              >
                <span className="text-xl leading-none mb-1">{item.icon}</span>
                <span className="text-[10px] text-zinc-400">{item.label}</span>
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span className="absolute -top-1 -right-1 text-[9px] min-w-[16px] h-4 px-1 rounded-full bg-cyan-500 text-black font-semibold flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Invite panel — only when opened */}
        {showInvite && profile?.username && (
          <div className="mb-8 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.04] p-4 animate-in">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-medium">One-shot invite</p>
                <p className="text-[11px] text-zinc-500">One use · then gone</p>
              </div>
              <button
                onClick={() => setShowInvite(false)}
                className="text-zinc-500 hover:text-white text-sm px-2"
              >
                ✕
              </button>
            </div>

            {!inviteUrl ? (
              <button
                onClick={createInvite}
                disabled={creatingInvite}
                className="w-full py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-sm hover:border-cyan-500/40 transition disabled:opacity-50"
              >
                {creatingInvite ? 'Creating…' : 'Generate link'}
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <p className="flex-1 text-[11px] font-mono text-cyan-300/90 break-all bg-black/40 rounded-xl px-3 py-2 border border-white/5">
                    {inviteUrl}
                  </p>
                  <button
                    onClick={copyInvite}
                    className="px-3 rounded-xl bg-cyan-500 text-black text-xs font-semibold shrink-0"
                  >
                    Copy
                  </button>
                </div>
                <button
                  onClick={revokeInvite}
                  disabled={revoking}
                  className="text-[11px] text-red-300/80 hover:text-red-200"
                >
                  {revoking ? 'Revoking…' : 'Revoke link'}
                </button>
              </div>
            )}
            {inviteMsg && (
              <p className="text-[11px] text-cyan-400/80 mt-2 text-center">
                {inviteMsg}
              </p>
            )}
          </div>
        )}

        {/* Quiet footer — text links, not big buttons */}
        <div className="pt-4 border-t border-white/5">
          <div className="flex items-center justify-center gap-4 text-xs text-zinc-500">
            {user?.id === ADMIN_ID && (
              <>
                <button
                  onClick={() => router.push('/admin/reports')}
                  className="hover:text-purple-300 transition"
                >
                  Admin
                </button>
                <span className="text-zinc-700">·</span>
              </>
            )}
            <button onClick={handleLogout} className="hover:text-white transition">
              {t.logout}
            </button>
            <span className="text-zinc-700">·</span>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="hover:text-red-300 transition"
            >
              {t.deleteAccount}
            </button>
          </div>
          <div className="mt-4 flex items-center justify-center gap-3 text-[11px] text-zinc-600">
            <button onClick={() => router.push('/terms')} className="hover:text-cyan-500/70">
              {t.termsShort}
            </button>
            <span>·</span>
            <button onClick={() => router.push('/privacy')} className="hover:text-cyan-500/70">
              {t.privacyShort}
            </button>
          </div>
        </div>
      </main>

      {showBlockedModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#0c0e14] border border-white/10 rounded-3xl p-5 w-full max-w-sm">
            <div className="flex justify-between mb-4">
              <h3 className="font-semibold">{t.blockedUsers}</h3>
              <button onClick={() => setShowBlockedModal(false)} className="text-zinc-500">
                ×
              </button>
            </div>
            {blockedUsers.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-8">{t.noBlockedUsers}</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {blockedUsers.map((u) => (
                  <div
                    key={u.id}
                    className="flex justify-between items-center py-2 px-3 rounded-xl bg-white/[0.03]"
                  >
                    <span className="text-sm">{u.username || 'Unknown'}</span>
                    <button
                      onClick={() => unblockUser(u.id)}
                      className="text-xs text-cyan-400"
                    >
                      {t.unblock}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#0c0e14] border border-white/10 rounded-3xl p-5 w-full max-w-sm">
            <h3 className="font-semibold mb-2">{t.deleteAccountTitle}</h3>
            <p className="text-sm text-zinc-400 mb-5">{t.deleteAccountDesc}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-zinc-800"
              >
                {t.cancel}
              </button>
              <button
                onClick={deleteAccount}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-600"
              >
                {deleting ? t.deleting : t.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}