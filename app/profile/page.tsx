'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getLang, setLang, translations, type Lang } from '@/lib/i18n'

const ICON_CATEGORIES: { id: string; label: string; icons: string[] }[] = [
  {
    id: 'masks',
    label: '🎭',
    icons: [
      '🎭', '👻', '💀', '☠️', '👽', '🤖', '🥷', '🤡', '👺', '👹', '👿', '😈',
      '🎃', '🧟', '🧛', '🧜', '🧞', '🧚', '🧙',
    ],
  },
  {
    id: 'animals',
    label: '🦊',
    icons: [
      '🦊', '🐼', '🐺', '🐯', '🦁', '🐸', '🐙', '🦄', '🐲', '🦇', '🕷️', '🦂',
      '🐍', '🦈', '🦑', '🦎', '🐊', '🐧', '🦉', '🦝', '🐱', '🐶', '🐨', '🐻',
      '🐮', '🐷', '🐵', '🐔', '🦅', '🦆', '🦜', '🦩', '🦚', '🐢', '🦕', '🦖',
      '🐳', '🐋', '🐬', '🦭', '🦦', '🦥',
    ],
  },
  {
    id: 'space',
    label: '🌙',
    icons: [
      '🌙', '⭐', '🌟', '✨', '☄️', '🪐', '🌌', '🛸', '🚀', '🌑', '🌕', '🛰️',
      '💫', '🌠', '🌎', '🌍', '🌏',
    ],
  },
  {
    id: 'nature',
    label: '🔥',
    icons: [
      '🔥', '⚡', '💥', '🌪️', '❄️', '🌊', '🫧', '🧿', '☁️', '🌧️', '⛈️', '🌈',
      '☀️', '🌤️', '🌫️',
    ],
  },
  {
    id: 'objects',
    label: '🔮',
    icons: [
      '👁️', '🧠', '🦴', '🪞', '🎩', '🕶️', '🎱', '🃏', '♟️', '🔮',
      '🧱', '🗝️', '🗿', '🎪', '🎯', '🎲', '🧩', '🪬', '💎', '👑',
      '🗡️', '⚔️', '🛡️', '🏹', '💣', '🧨', '🪓', '🪄',
    ],
  },
  {
    id: 'symbols',
    label: '✦',
    icons: [
      '♠️', '♥️', '♦️', '♣️', '∞', '※', '☯', '☮', '☢', '☣', '✪', '✦',
      '◆', '◇', '○', '●', '□', '■', '△', '▲', '▽', '▼',
    ],
  },
]

function catKey(cat: string, icon: string) {
  return `${cat}-${icon}`
}

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [username, setUsername] = useState('')
  const [isOffline, setIsOffline] = useState(false)
  const [avatarIcon, setAvatarIcon] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lang, setLangState] = useState<Lang>('en')
  const [iconTab, setIconTab] = useState(ICON_CATEGORIES[0].id)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
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
        router.push('/auth')
        return
      }
      if (profile.status === 'suspended') {
        router.push('/appeal')
        return
      }
      if (profile.status === 'banned') {
        await supabase.auth.signOut()
        router.push('/auth')
        return
      }
      setUsername(profile.username || '')
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
    setSaving(true)
    setMessage('')
    const { error } = await supabase
      .from('profiles')
      .update({
        is_offline: isOffline,
        avatar_icon: avatarIcon || null,
      })
      .eq('id', user.id)
    if (error) setMessage(error.message)
    else setMessage('Saved')
    setSaving(false)
  }

  const handleLeave = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const wipeIdentity = async () => {
    if (!user) return
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
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    })
    const data = await res.json().catch(() => ({}))
    setDeleting(false)
    if (!res.ok) {
      alert(data.error || 'Could not wipe identity')
      return
    }
    await supabase.auth.signOut()
    router.push('/')
  }

  const activeCategory =
    ICON_CATEGORIES.find((c) => c.id === iconTab) || ICON_CATEGORIES[0]

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-zinc-400">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[400px] bg-cyan-500/10 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-md mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={() => router.push('/home')}
            className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 border border-cyan-500/40 bg-cyan-500/15 hover:bg-cyan-500/25 px-5 py-2.5 rounded-full transition"
          >
            ← Back
          </button>
          <div className="flex gap-1">
            <button
              onClick={() => changeLang('en')}
              className={`text-xs px-2.5 py-1 rounded-full border ${
                lang === 'en'
                  ? 'bg-cyan-500 text-black border-cyan-400'
                  : 'border-zinc-700 text-zinc-500'
              }`}
            >
              EN
            </button>
            <button
              onClick={() => changeLang('sw')}
              className={`text-xs px-2.5 py-1 rounded-full border ${
                lang === 'sw'
                  ? 'bg-cyan-500 text-black border-cyan-400'
                  : 'border-zinc-700 text-zinc-500'
              }`}
            >
              SW
            </button>
          </div>
        </div>

        <h1 className="text-2xl font-bold mb-1">My account</h1>
        <p className="text-zinc-500 text-sm mb-1 tracking-[0.15em] font-mono">
          {username || '—'}
        </p>
        <p className="text-xs text-zinc-600 mb-6">Temporary name · no email</p>

        <div className="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-5 space-y-5 shadow-2xl">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
              Anonymous icon
            </p>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-14 h-14 rounded-2xl bg-black/50 border border-cyan-500/30 flex items-center justify-center text-3xl">
                {avatarIcon || '🎭'}
              </div>
              <p className="text-sm text-zinc-400">
                Pick a category, then an icon
              </p>
            </div>
            <div className="flex gap-1 overflow-x-auto pb-2 mb-2">
              {ICON_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setIconTab(cat.id)}
                  className={`shrink-0 w-11 h-11 rounded-xl text-xl flex items-center justify-center border transition ${
                    iconTab === cat.id
                      ? 'bg-cyan-500/20 border-cyan-400 text-white'
                      : 'bg-zinc-800/80 border-zinc-700 text-zinc-400'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-6 gap-1.5 max-h-44 overflow-y-auto p-2 rounded-2xl bg-black/40 border border-zinc-800">
              {activeCategory.icons.map((icon) => (
                <button
                  key={catKey(activeCategory.id, icon)}
                  type="button"
                  onClick={() => setAvatarIcon(icon)}
                  className={`h-10 rounded-xl text-xl flex items-center justify-center transition ${
                    avatarIcon === icon
                      ? 'bg-cyan-500/30 ring-2 ring-cyan-400'
                      : 'bg-zinc-800/60 hover:bg-zinc-700'
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setAvatarIcon('')}
              className="mt-2 text-xs text-zinc-500 hover:text-zinc-300"
            >
              Clear icon
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                {t.goOffline || 'Go offline'}
              </p>
              <p className="text-xs text-zinc-500">
                {t.goOfflineHelp || 'Hidden from search when offline'}
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
            {saving ? t.pleaseWait || 'Please wait...' : t.saveProfile || 'Save'}
          </button>
          {message && (
            <p className="text-center text-sm text-cyan-400">{message}</p>
          )}
        </div>

        <div className="mt-6 space-y-3">
          <button
            onClick={handleLeave}
            className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-3.5 rounded-2xl border border-zinc-700 transition"
          >
            Leave
          </button>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="w-full bg-red-600/90 hover:bg-red-500 text-white font-medium py-3.5 rounded-2xl transition"
          >
            Wipe identity
          </button>
        </div>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-5 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-semibold mb-2">Wipe this identity?</h3>
            <p className="text-zinc-400 text-sm mb-5">
              Removes your temporary name and data for this session. This cannot
              be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 bg-zinc-700 hover:bg-zinc-600 py-2.5 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={wipeIdentity}
                disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-500 py-2.5 rounded-xl transition"
              >
                {deleting ? '…' : 'Wipe'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}