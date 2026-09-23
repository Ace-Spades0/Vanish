'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'

export default function LandingPage() {
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        router.push('/home')
        return
      }
      setLoading(false)
    }
    checkAuth()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-zinc-400">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
        
        <div className="mb-6">
          <Image
            src="/logo.png"
            alt="Vanish Logo"
            width={110}
            height={110}
            className="mx-auto"
            priority
          />
        </div>

        <h1 className="text-6xl md:text-7xl font-bold tracking-tight mb-4">
          VANISH
        </h1>

        <p className="text-xl md:text-2xl text-zinc-400 mb-3">
          Talk freely. Stay private.
        </p>

        <p className="text-zinc-500 max-w-md mb-10 text-sm md:text-base">
          Temporary usernames. Messages that disappear. No permanent identity.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xs">
          <button
            onClick={() => router.push('/auth')}
            className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-3.5 rounded-xl transition"
          >
            Get Started
          </button>
          <button
            onClick={() => router.push('/auth')}
            className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-3.5 rounded-xl transition border border-zinc-700"
          >
            Login
          </button>
        </div>

        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full">
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
            <div className="text-3xl mb-3">⏱️</div>
            <h3 className="font-semibold mb-2">3-Hour Messages</h3>
            <p className="text-zinc-400 text-sm">
              Every message automatically disappears after 3 hours.
            </p>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
            <div className="text-3xl mb-3">🛡️</div>
            <h3 className="font-semibold mb-2">Anti-Interrogation</h3>
            <p className="text-zinc-400 text-sm">
              Too many questions? Chat expires early.
            </p>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
            <div className="text-3xl mb-3">🎭</div>
            <h3 className="font-semibold mb-2">Daily Usernames</h3>
            <p className="text-zinc-400 text-sm">
              Pick a new name every 24 hours. Fully temporary identity.
            </p>
          </div>
        </div>

        {/* Terms & Privacy links */}
        <div className="mt-16 flex items-center gap-4 text-sm text-zinc-500">
          <button
            onClick={() => router.push('/terms')}
            className="hover:text-cyan-400 transition"
          >
            Terms of Service
          </button>
          <span>•</span>
          <button
            onClick={() => router.push('/privacy')}
            className="hover:text-cyan-400 transition"
          >
            Privacy & Security
          </button>
        </div>
      </div>
    </div>
  )
}