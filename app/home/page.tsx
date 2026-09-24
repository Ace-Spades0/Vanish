'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'

export default function HomePage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [blockedUsers, setBlockedUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const router = useRouter()

  const loadBlockedUsers = async (userId: string) => {
    const { data: blocks, error } = await supabase
      .from('blocks')
      .select('blocked_id')
      .eq('blocker_id', userId)

    if (error || !blocks || blocks.length === 0) {
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
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
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
        Loading...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4 py-8">
      <div className="mb-5">
        <Image src="/logo.png" alt="Vanish Logo" width={90} height={90} className="mx-auto" priority />
      </div>

      <h1 className="text-5xl font-bold mb-2 tracking-tight">VANISH</h1>
      <p className="text-zinc-400 mb-10">Talk freely. Stay private.</p>

      <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl text-center max-w-md w-full shadow-xl">
        <h2 className="text-2xl font-semibold mb-6">Welcome</h2>

        <div className="mb-6">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Email</p>
          <p className="text-zinc-300 break-all">{user?.email}</p>
        </div>

        <div className="mb-8">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Username</p>
          <p className="text-cyan-400 text-2xl font-medium">
            {profile?.username ? profile.username : 'No username yet'}
          </p>
        </div>

        <div className="space-y-3">
          {!profile?.username ? (
            <button
              onClick={() => router.push('/username')}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-medium py-3.5 rounded-xl"
            >
              Pick a username
            </button>
          ) : (
            <button
              onClick={() => router.push('/search')}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-3.5 rounded-xl border border-zinc-700"
            >
              Search Users
            </button>
          )}

          <button
            onClick={handleLogout}
            className="w-full bg-red-600/90 hover:bg-red-500 text-white font-medium py-3.5 rounded-xl"
          >
            Logout
          </button>

          <button
            onClick={() => setShowDeleteModal(true)}
            className="w-full bg-red-900 hover:bg-red-800 text-white font-medium py-3.5 rounded-xl border border-red-800"
          >
            Delete Account
          </button>
        </div>

        <div className="mt-8 text-left">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-3">Blocked users</p>
          {blockedUsers.length === 0 ? (
            <p className="text-zinc-600 text-sm">No blocked users</p>
          ) : (
            <div className="space-y-2">
              {blockedUsers.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between bg-zinc-800 px-3 py-2 rounded-xl"
                >
                  <span className="text-sm text-zinc-300">{u.username || 'Unknown'}</span>
                  <button
                    onClick={() => unblockUser(u.id)}
                    className="text-xs bg-cyan-600 hover:bg-cyan-500 px-3 py-1 rounded-lg"
                  >
                    Unblock
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-2">Delete account?</h3>
            <p className="text-zinc-400 text-sm mb-5">
              This will permanently delete your account. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 bg-zinc-700 py-2 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={deleteAccount}
                disabled={deleting}
                className="flex-1 bg-red-600 py-2 rounded-xl"
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