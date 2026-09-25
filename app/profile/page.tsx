'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const ANON_ICONS = ['🎭', '👻', '🦊', '🐼', '🐺', '🐯', '🦁', '🐸', '🐙', '🌙', '⭐', '🔥']

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [isOffline, setIsOffline] = useState(false)
  const [avatarIcon, setAvatarIcon] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
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

    if (error) {
      setMessage(error.message)
    } else {
      setBio(cleanBio)
      setMessage('Profile saved')
    }

    setSaving(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-zinc-400">Loading profile...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white px-4 py-10">
      <div className="max-w-md mx-auto">
        <button
          onClick={() => router.push('/home')}
          className="text-sm text-zinc-400 hover:text-white mb-8"
        >
          ← Back to Home
        </button>

        <h1 className="text-3xl font-bold mb-2">Profile</h1>
        <p className="text-zinc-500 text-sm mb-8">
          Edit bio, offline mode, and anonymous icon. Username cannot be changed here.
        </p>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
          {/* Username (read only) */}
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 mb-2">
              Username
            </p>
            <p className="text-2xl font-semibold text-cyan-400">
              {username || 'No username'}
            </p>
          </div>

          {/* Anonymous icon */}
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 mb-3">
              Anonymous icon
            </p>
            <div className="grid grid-cols-6 gap-2">
              {ANON_ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setAvatarIcon(icon)}
                  className={`h-11 rounded-xl text-xl flex items-center justify-center border transition ${
                    avatarIcon === icon
                      ? 'bg-cyan-500/20 border-cyan-400'
                      : 'bg-zinc-800 border-zinc-700 hover:border-zinc-500'
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setAvatarIcon('')}
              className="mt-3 text-xs text-zinc-400 hover:text-white"
            >
              Clear icon
            </button>
          </div>

          {/* Bio */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                Bio
              </p>
              <p className="text-xs text-zinc-500">{bio.length}/20</p>
            </div>
            <input
              type="text"
              value={bio}
              maxLength={20}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Max 20 characters"
              className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-cyan-400 text-sm"
            />
          </div>

          {/* Offline mode */}
          <div className="flex items-center justify-between bg-zinc-800/70 border border-zinc-700 rounded-2xl px-4 py-3">
            <div>
              <p className="font-medium">Go offline</p>
              <p className="text-xs text-zinc-400 mt-1">
                When offline, others cannot find you in Search.
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
            {saving ? 'Saving...' : 'Save profile'}
          </button>

          {message && (
            <p className="text-center text-sm text-cyan-400">{message}</p>
          )}
        </div>
      </div>
    </div>
  )
}