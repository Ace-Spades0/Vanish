'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'
import { getLang, setLang, translations, type Lang } from '@/lib/i18n'

const ADMIN_ID = 'a78d8a8e-de03-4159-a3c2-b5788e7cf5b7'

export default function HomePage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [blockedUsers, setBlockedUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showBlockedModal, setShowBlockedModal] = useState(false)
  const [lang, setLangState] = useState<Lang>('en')
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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth')
        return
      }
      setUser(user)

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      if (profileData?.status === 'suspended' || profileData?.status === 'banned') {
        await supabase.auth.signOut()
        router.push('/auth')
        return
      }

      if (profileData?.username && profileData?.username_claimed_at) {
        const hoursPassed =
          (Date.now() - new Date(profileData.username_claimed_at).getTime()) /
          (1000 * 60 * 60)
        if (hoursPassed < 24) setProfile(profileData)
        else setProfile(null)
      } else {
        setProfile(null)
      }

      await loadBlockedUsers(user.id)
      setLoading(false)
    }
    loadData()
  }, [])

  const changeLang = (next: Lang) => {
    setLang(next)
    setLangState(next)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
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
    const { data: { session } } = await supabase.auth.getSession()
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
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-zinc-400 text-sm">{t.loading}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[480px] h-[480px] bg-cyan-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 right-0 w-[320px] h-[320px] bg-blue-600/10 blur-[100px] rounded-full" />
      </div>

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-10">
        <div className="absolute top-4 right-4 flex gap-2">
          <button
            onClick={() => changeLang('en')}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              lang === 'en'
                ? 'bg-cyan-500 text-black border-cyan-400'
                : 'bg-zinc-900 text-zinc-300 border-zinc-700'
            }`}
          >
            EN
          </button>
          <button
            onClick={() => changeLang('sw')}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              lang === 'sw'
                ? 'bg-cyan-500 text-black border-cyan-400'
                : 'bg-zinc-900 text-zinc-300 border-zinc-700'
            }`}
          >
            SW
          </button>
        </div>

        <div className="mb-6">
          <Image
            src="/logo.png"
            alt="Vanish Logo"
            width={88}
            height={88}
            className="mx-auto drop-shadow-[0_0_25px_rgba(34,211,238,0.35)]"
            priority
          />
        </div>

        <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-2">{t.appName}</h1>
        <p className="text-zinc-400 mb-8 text-center">{t.tagline}</p>

        <div className="w-full max-w-md bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-3xl p-6 shadow-2xl">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">{profile?.avatar_icon || '🎭'}</div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 mb-2">
              {t.username}
            </p>
            <p className="text-3xl font-semibold text-cyan-400">
              {profile?.username ? profile.username : t.noUsername}
            </p>
            {profile?.bio ? (
              <p className="text-sm text-zinc-400 mt-2">{profile.bio}</p>
            ) : null}
            <p className="text-xs text-zinc-500 mt-2 break-all">{user?.email}</p>
            <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
              <p className="inline-block text-[11px] px-3 py-1 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                {t.privateByDesign}
              </p>
              {profile?.is_offline ? (
                <p className="inline-block text-[11px] px-3 py-1 rounded-full bg-zinc-800 text-yellow-300 border border-zinc-700">
                  {t.offline}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-3">
            {!profile?.username ? (
              <button
                onClick={() => router.push('/username')}
                className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-3.5 rounded-2xl transition"
              >
                {t.pickUsername}
              </button>
            ) : (
              <button
                onClick={() => router.push('/search')}
                className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-3.5 rounded-2xl transition"
              >
                {t.startChat}
              </button>
            )}

            <button
              onClick={() => router.push('/profile')}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-3.5 rounded-2xl transition border border-zinc-700"
            >
              {t.profile}
            </button>

            <button
              onClick={() => setShowBlockedModal(true)}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-3.5 rounded-2xl transition border border-zinc-700 flex items-center justify-center gap-2"
            >
              {t.blockedUsers}
              <span className="text-xs bg-zinc-900 border border-zinc-600 px-2 py-0.5 rounded-full">
                {blockedUsers.length}
              </span>
            </button>

            {user?.id === ADMIN_ID && (
              <button
                onClick={() => router.push('/admin/reports')}
                className="w-full bg-purple-700 hover:bg-purple-600 text-white font-medium py-3.5 rounded-2xl transition"
              >
                {t.admin}
              </button>
            )}

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                onClick={handleLogout}
                className="bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-3 rounded-2xl transition border border-zinc-700"
              >
                {t.logout}
              </button>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="bg-red-950 hover:bg-red-900 text-red-300 font-medium py-3 rounded-2xl transition border border-red-900"
              >
                {t.deleteAccount}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8 flex items-center gap-4 text-xs text-zinc-500">
          <button onClick={() => router.push('/terms')} className="hover:text-cyan-400 transition">
            {t.termsShort}
          </button>
          <span>•</span>
          <button onClick={() => router.push('/privacy')} className="hover:text-cyan-400 transition">
            {t.privacyShort}
          </button>
        </div>
      </div>

      {showBlockedModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-5 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{t.blockedUsers}</h3>
              <button
                onClick={() => setShowBlockedModal(false)}
                className="text-zinc-400 hover:text-white text-xl leading-none"
              >
                ×
              </button>
            </div>

            {blockedUsers.length === 0 ? (
              <p className="text-zinc-500 text-sm py-6 text-center">{t.noBlockedUsers}</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {blockedUsers.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between bg-zinc-800/80 px-3 py-3 rounded-2xl border border-zinc-700"
                  >
                    <span className="text-sm text-zinc-200">{u.username || 'Unknown'}</span>
                    <button
                      onClick={() => unblockUser(u.id)}
                      className="text-xs bg-cyan-600 hover:bg-cyan-500 px-3 py-1.5 rounded-lg transition"
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
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-5 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-semibold mb-2">{t.deleteAccountTitle}</h3>
            <p className="text-zinc-400 text-sm mb-5">{t.deleteAccountDesc}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 bg-zinc-700 hover:bg-zinc-600 py-2.5 rounded-xl transition"
              >
                {t.cancel}
              </button>
              <button
                onClick={deleteAccount}
                disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-500 py-2.5 rounded-xl transition"
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