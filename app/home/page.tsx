'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'

export default function HomePage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

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

      if (profileData?.username && profileData?.username_claimed_at) {
        const hoursPassed =
          (Date.now() - new Date(profileData.username_claimed_at).getTime()) /
          (1000 * 60 * 60)
        if (hoursPassed < 24) {
          setProfile(profileData)
        } else {
          setProfile(null)
        }
      } else {
        setProfile(null)
      }
      setLoading(false)
    }
    loadData()
  }, [])

  const handleLogout = async () => {
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
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4">
      
      {/* Logo */}
      <div className="mb-5">
        <Image
          src="/logo.png"
          alt="Vanish Logo"
          width={90}
          height={90}
          className="mx-auto"
          priority
        />
      </div>

      <h1 className="text-5xl font-bold mb-2 tracking-tight">VANISH</h1>
      <p className="text-zinc-400 mb-10">Talk freely. Stay private.</p>

      <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl text-center max-w-md w-full shadow-xl">
        <h2 className="text-2xl font-semibold mb-6">Welcome</h2>

        <div className="mb-6">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">
            Email
          </p>
          <p className="text-zinc-300 break-all">{user?.email}</p>
        </div>

        <div className="mb-8">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">
            Username
          </p>
          <p className="text-cyan-400 text-2xl font-medium">
            {profile?.username ? profile.username : 'No username yet'}
          </p>
        </div>

        <div className="space-y-3">
          {!profile?.username ? (
            <button
              onClick={() => router.push('/username')}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-medium py-3.5 rounded-xl transition"
            >
              Pick a username
            </button>
          ) : (
            <button
              onClick={() => router.push('/search')}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-3.5 rounded-xl transition border border-zinc-700"
            >
              Search Users
            </button>
          )}

          <button
            onClick={handleLogout}
            className="w-full bg-red-600/90 hover:bg-red-500 text-white font-medium py-3.5 rounded-xl transition"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  )
}