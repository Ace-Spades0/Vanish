'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getLang, setLang, translations, type Lang } from '@/lib/i18n'

const ANON_ICONS = [
  '🎭', '👻', '💀', '☠️', '👽', '🤖', '🥷', '🤡', '👺', '👹', '👿', '😈',
  '🎃', '🧟', '🧛', '🧜', '🧞', '🧚', '🧙',
  '🦊', '🐼', '🐺', '🐯', '🦁', '🐸', '🐙', '🦄', '🐲', '🦇', '🕷️', '🦂',
  '🐍', '🦈', '🦑', '🦎', '🐊', '🐧', '🦉', '🦝', '🐱', '🐶', '🐨', '🐻',
  '🐮', '🐷', '🐵', '🐔', '🦅', '🦆', '🦜', '🦩', '🦚',
  '🐢', '🦕', '🦖', '🐳', '🐋', '🐬', '🦭', '🦦', '🦥', '🦨', '🦡', '🦫',
  '🌙', '⭐', '🌟', '✨', '☄️', '🪐', '🌌', '🛸', '🚀', '🌑', '🌕', '🛰️',
  '💫', '🌠', '🌎', '🌍', '🌏',
  '🔥', '⚡', '💥', '🌪️', '❄️', '🌊', '🫧', '🧿', '☁️', '🌧️', '⛈️', '🌈',
  '☀️', '🌤️', '🌫️',
  '👁️', '🧠', '🦴', '🪞', '🎩', '🕶️', '🎱', '🃏', '♟️', '🔮',
  '🧱', '🗝️', '🗿', '🎪', '🎯', '🎲', '🧩', '🪬', '💎', '👑',
  '🗡️', '⚔️', '🛡️', '🏹', '💣', '🧨', '🪓', '🪄', '📿', '💍',
  '⌚', '📱', '💻', '📷', '📹', '🎥', '📺',
  '📻', '🎙️', '🔔', '🎧', '🎵', '🎶', '🎼', '🎹', '🥁', '🎸',
  '♠️', '♥️', '♦️', '♣️',
  '∞', '※', '☯', '☮', '☢', '☣', '✪', '✦',
  '◆', '◇', '○', '●', '□', '■', '△', '▲', '▽', '▼',
]

const uniqueIcons = Array.from(new Set(ANON_ICONS))

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [isOffline, setIsOffline] = useState(false)
  const [avatarIcon, setAvatarIcon] = useState('')
  const [message, setMessage] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sendingPassword, setSendingPassword] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [lang, setLangState] = useState<Lang>('en')
  const t = translations[lang]

  useEffect(() => {
    setLangState(getLang())

    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth')
        return
      }
      setUser(user)

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      if (!profile) {
        router.push('/home')
        return
      }

      if (profile.status === 'suspended' || profile.status === 'banned') {
        await supabase.auth.signOut()
        router.push('/auth')
        return
      }

      setUsername(profile.username || '')
      setBio(profile.bio || '')
      setIsOffline(!!profile.is_offline)
      setAvatarIcon(profile.avatar_icon || '')
      setLoading(false)
    }
    load()
  }, [])

  const changeLang = (next: Lang) => {
    setLang(next)
    setLangState(next)
  }

  const saveProfile = async () => {
    if (!user) return
    const cleanBio = bio.trim().slice(0, 20)
    setSaving(true)
    setMessage('')

    const { error } = await supabase
      .from('profiles')
      .update({
        bio: cleanBio,
        is_offline: isOffline,
        avatar_icon: avatarIcon || null,
      })
      .eq('id', user.id)

    if (error) setMessage(error.message)
    else {
      setBio(cleanBio)
      setMessage('Profile saved')
    }
    setSaving(false)
  }

  const sendPasswordChangeEmail = async () => {
    if (!user?.email) return
    setSendingPassword(true)
    setPasswordMessage('')

    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/auth`,
    })

    if (error) setPasswordMessage(error.message)
    else setPasswordMessage('Password change email sent. Check your inbox.')
    setSendingPassword(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
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
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[520px] h-[420px] bg-cyan-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 right-0 w-[280px] h-[280px] bg-blue-600/10 blur-[100px] rounded-full" />
      </div>

      <div className="relative z-10 px-4 py-10">
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

        <div className="max-w-md mx-auto">
          <button
            onClick={() => router.push('/home')}
            className="inline-flex items-center gap-2 text-sm font-medium text-cyan-400 border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 px-4 py-2.5 rounded-full mb-8 transition"
          >
            ← Back to Home
          </button>

          <h1 className="text-3xl font-bold mb-2">
            {t.profileTitle || 'My account'}
          </h1>
          <p className="text-zinc-500 text-sm mb-8">
            {t.profileHelp || 'Bio, icon, offline, password, logout'}
          </p>

          <div className="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 space-y-6 shadow-2xl backdrop-blur-sm">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 mb-2">
                {t.username || 'Username'}
              </p>
              <p className="text-2xl font-semibold text-cyan-400">
                {username || t.noUsername || 'No username'}
              </p>
              {user?.email && (
                <p className="text-xs text-zinc-500 mt-1 break-all">{user.email}</p>
              )}
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 mb-3">
                {t.anonymousIcon || 'Anonymous icon'}
              </p>

              {avatarIcon ? (
                <div className="mb-3 text-center text-4xl">{avatarIcon}</div>
              ) : null}

              {/* Horizontal scroll — all icons, no stressful dump */}
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                {uniqueIcons.map((icon, index) => (
                  <button
                    key={`${icon}-${index}`}
                    type="button"
                    onClick={() => setAvatarIcon(icon)}
                    className={`h-12 w-12 shrink-0 rounded-xl text-xl flex items-center justify-center border transition ${
                      avatarIcon === icon
                        ? 'bg-cyan-500/20 border-cyan-400 scale-105'
                        : 'bg-zinc-800 border-zinc-700 hover:border-zinc-500'
                    }`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-[11px] text-zinc-500">
                  Swipe sideways to browse all {uniqueIcons.length} icons
                </p>
                <button
                  type="button"
                  onClick={() => setAvatarIcon('')}
                  className="text-xs text-zinc-400 hover:text-white"
                >
                  {t.clearIcon || 'Clear'}
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                  {t.bio || 'Bio'}
                </p>
                <p className="text-xs text-zinc-500">{bio.length}/20</p>
              </div>
              <input
                type="text"
                value={bio}
                maxLength={20}
                onChange={(e) => setBio(e.target.value)}
                placeholder={t.maxBio || 'Max 20 characters'}
                className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-cyan-400 text-sm"
              />
            </div>

            <div className="flex items-center justify-between bg-zinc-800/70 border border-zinc-700 rounded-2xl px-4 py-3">
              <div>
                <p className="font-medium">{t.goOffline || 'Go offline'}</p>
                <p className="text-xs text-zinc-400 mt-1">
                  {t.goOfflineHelp || 'Hidden from search while offline'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOffline(!isOffline)}
                className={`w-14 h-8 rounded-full p-1 transition ${
                  isOffline ? 'bg-cyan-500' : 'bg-zinc-600'
                }`}
              >
                <div
                  className={`w-6 h-6 bg-white rounded-full transition ${
                    isOffline ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <button
              onClick={saveProfile}
              disabled={saving}
              className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-semibold py-3.5 rounded-2xl transition"
            >
              {saving
                ? t.pleaseWait || 'Please wait...'
                : t.saveProfile || 'Save profile'}
            </button>

            {message && (
              <p className="text-center text-sm text-cyan-400">{message}</p>
            )}
          </div>

          <div className="mt-6 bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 shadow-2xl backdrop-blur-sm">
            <h2 className="text-lg font-semibold mb-2">
              {t.changePassword || 'Change password'}
            </h2>
            <p className="text-sm text-zinc-400 mb-4">
              {t.changePasswordHelp || 'We will email you a reset link.'}
            </p>
            <button
              onClick={sendPasswordChangeEmail}
              disabled={sendingPassword}
              className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white font-medium py-3 rounded-2xl border border-zinc-700 transition"
            >
              {sendingPassword
                ? t.pleaseWait || 'Please wait...'
                : t.sendPasswordEmail || 'Send password email'}
            </button>
            {passwordMessage && (
              <p className="mt-4 text-center text-sm text-cyan-400">
                {passwordMessage}
              </p>
            )}
          </div>

          <div className="mt-6 bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-3 backdrop-blur-sm">
            <h2 className="text-lg font-semibold mb-1">Account</h2>
            <p className="text-sm text-zinc-500 mb-3">
              Logout or permanently delete your Go Vanish account.
            </p>
            <button
              onClick={handleLogout}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-3 rounded-2xl border border-zinc-700 transition"
            >
              Logout
            </button>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="w-full bg-red-950 hover:bg-red-900 text-red-300 font-medium py-3 rounded-2xl border border-red-900 transition"
            >
              Delete account
            </button>
          </div>
        </div>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-5 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-semibold mb-2">Delete account?</h3>
            <p className="text-zinc-400 text-sm mb-5">
              This permanently deletes your account. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 bg-zinc-700 hover:bg-zinc-600 py-2.5 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={deleteAccount}
                disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-500 py-2.5 rounded-xl transition disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}