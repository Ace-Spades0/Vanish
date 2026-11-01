'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
// ADDED: Import encryption functions
import { encryptText, decryptText, looksEncrypted } from '@/lib/e2ee'

const VIEW_OPTIONS = [
  { s: 5, label: '5s' },
  { s: 10, label: '10s' },
  { s: 15, label: '15s' },
  { s: 20, label: '20s' },
  { s: 25, label: '25s' },
  { s: 30, label: '30s' },
  { s: 60, label: '1m' },
  { s: 120, label: '2m' },
  { s: 240, label: '4m' },
]

function extractInviteCode(input: string) {
  const raw = input.trim()
  if (!raw) return ''
  if (raw.includes('/i/')) {
    const part = raw.split('/i/')[1] || ''
    return part.split(/[?#]/)[0].trim().toLowerCase()
  }
  return raw.trim().toLowerCase()
}

function autoViewSeconds(text: string) {
  const n = text.trim().length
  if (n <= 40) return 5
  if (n <= 120) return 8
  return 10
}

export default function LettersPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [tab, setTab] = useState<'inbox' | 'send'>('inbox')
  const [letters, setLetters] = useState<any[]>([])
  const [toInput, setToInput] = useState('')
  const [body, setBody] = useState('')
  const [viewSeconds, setViewSeconds] = useState(10)
  const [message, setMessage] = useState('')
  const [messageOk, setMessageOk] = useState(false)
  const [safetyAlert, setSafetyAlert] = useState(false)
  const [loading, setLoading] = useState(true)
  const [acceptedSafety, setAcceptedSafety] = useState(false)
  const [reading, setReading] = useState<any | null>(null)
  const [secsLeft, setSecsLeft] = useState<number | null>(null)
  const [vanishedLetter, setVanishedLetter] = useState(false)
  const [openSafety, setOpenSafety] = useState<any | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadInbox = async (userId: string) => {
    const { data } = await supabase
      .from('letters')
      .select('*')
      .eq('to_id', userId)
      .is('read_at', null)
      .order('created_at', { ascending: false })
    setLetters(data || [])
  }

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth')
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('status, suspended_until')
        .eq('id', user.id)
        .maybeSingle()
      if (profile?.status === 'banned') {
        await supabase.auth.signOut()
        router.push('/auth')
        return
      }
      if (profile?.status === 'suspended') {
        const until = profile.suspended_until
          ? new Date(profile.suspended_until).getTime()
          : null
        if (!until || until > Date.now()) {
          router.push('/appeal')
          return
        }
      }
      setUser(user)
      await loadInbox(user.id)

      const ch = supabase
        .channel(`letters-inbox-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'letters',
            filter: `to_id=eq.${user.id}`,
          },
          (payload) => {
            const row: any = payload.new
            if (!row || row.read_at) return
            setLetters((prev) => {
              if (prev.some((l) => l.id === row.id)) return prev
              return [row, ...prev]
            })
          }
        )
        .subscribe()

      try {
        const pre = sessionStorage.getItem('letter_to')
        if (pre) {
          setToInput(pre)
          setTab('send')
          sessionStorage.removeItem('letter_to')
        }
      } catch {
        /* ignore */
      }
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (!reading || secsLeft === null) return
    if (secsLeft <= 0) {
      ;(async () => {
        const letter = reading
        setReading(null)
        setSecsLeft(null)
        setVanishedLetter(true)
        if (letter?.id) {
          await supabase
            .from('letters')
            .update({ read_at: new Date().toISOString() })
            .eq('id', letter.id)
          await supabase.from('letters').delete().eq('id', letter.id)
          setLetters((prev) => prev.filter((l) => l.id !== letter.id))
        }
      })()
      return
    }
    timerRef.current = setInterval(() => {
      setSecsLeft((s) => (s === null ? null : s - 1))
    }, 1000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [reading, secsLeft])

  const resolveTarget = async (input: string) => {
    const trimmed = input.trim()
    if (!trimmed) return { error: 'Enter a username or vanish link' }
    if (trimmed.includes('/i/')) {
      const code = extractInviteCode(trimmed)
      const { data: invite } = await supabase
        .from('invites')
        .select('creator_id')
        .eq('code', code)
        .maybeSingle()
      if (!invite) return { error: 'Vanish link not found' }
      const { data: creator } = await supabase
        .from('profiles')
        .select('id, username, is_offline')
        .eq('id', invite.creator_id)
        .maybeSingle()
      if (!creator) return { error: 'User not available' }
      return { target: creator }
    }
    const { data: byName } = await supabase
      .from('profiles')
      .select('id, username, is_offline')
      .ilike('username', trimmed)
      .maybeSingle()
    if (byName) return { target: byName }
    const code = extractInviteCode(trimmed)
    if (code.length >= 6) {
      const { data: invite } = await supabase
        .from('invites')
        .select('creator_id')
        .eq('code', code)
        .maybeSingle()
      if (invite) {
        const { data: creator } = await supabase
          .from('profiles')
          .select('id, username, is_offline')
          .eq('id', invite.creator_id)
          .maybeSingle()
        if (creator) return { target: creator }
      }
    }
    return { error: 'User not found' }
  }

  const isBlockedEitherWay = async (a: string, b: string) => {
    const { data } = await supabase
      .from('blocks')
      .select('id')
      .or(
        `and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`
      )
      .limit(1)
    return !!(data && data.length)
  }

  const sendLetter = async () => {
    setMessage('')
    setMessageOk(false)
    setSafetyAlert(false)
    if (!user) return
    if (!acceptedSafety) {
      setSafetyAlert(true)
      setMessage('Please confirm the safety note first')
      return
    }
    if (!toInput.trim() || !body.trim()) {
      setMessage('Recipient and message required')
      return
    }
    if (body.trim().length > 500) {
      setMessage('Max 500 characters')
      return
    }
    const resolved = await resolveTarget(toInput)
    if (resolved.error || !resolved.target) {
      setMessage(resolved.error || 'User not found')
      return
    }
    const target = resolved.target
    if (target.id === user.id) {
      setMessage('You cannot send a letter to yourself')
      return
    }
    if (target.is_offline) {
      setMessage('User is not found')
      return
    }
    if (await isBlockedEitherWay(user.id, target.id)) {
      setMessage('User is not found')
      return
    }

    // NEW: Encrypt the letter body before sending to database
    const convId = [user.id, target.id].sort().join('_')
    let encryptedBody = body.trim()
    try {
      encryptedBody = await encryptText(convId, body.trim())
    } catch (err) {
      setMessage('Failed to encrypt letter securely')
      return
    }

    const secs = viewSeconds || autoViewSeconds(body)
    const row: any = {
      from_id: user.id,
      to_username: target.username,
      to_id: target.id,
      body: encryptedBody, // Send encrypted payload
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      view_seconds: secs,
    }
    let { error } = await supabase.from('letters').insert(row)
    if (error && String(error.message || '').includes('view_seconds')) {
      delete row.view_seconds
      row.body = `[[view:${secs}]]\n` + encryptedBody // Keep view timer but encrypt content
      const retry = await supabase.from('letters').insert(row)
      error = retry.error
    }
    if (error) {
      setMessage(error.message)
      setMessageOk(false)
    } else {
      setMessage(
        `✓ Letter encrypted and sent. When opened, it vanishes after ${secs}s.`
      )
      setMessageOk(true)
      setBody('')
      setToInput('')
      setSafetyAlert(false)
    }
  }

  const parseViewSeconds = (letter: any) => {
    if (letter.view_seconds && Number(letter.view_seconds) > 0) {
      return Number(letter.view_seconds)
    }
    const m = String(letter.body || '').match(/^\[\[view:(\d+)\]\]\n?/)
    if (m) return Math.min(240, Math.max(5, Number(m[1])))
    return autoViewSeconds(String(letter.body || ''))
  }

  const openLetter = async (letter: any) => {
    if (letter.read_at) return
    if (new Date(letter.expires_at).getTime() < Date.now()) {
      await supabase.from('letters').delete().eq('id', letter.id)
      setLetters((prev) => prev.filter((l) => l.id !== letter.id))
      return
    }
    setOpenSafety(letter)
  }

  const acceptOpenSafety = async () => {
    const letter = openSafety
    setOpenSafety(null)
    if (!letter || !user) return
    
    setVanishedLetter(false)
    
    // NEW: Decrypt the letter body locally before displaying
    let plainBody = letter.body
    if (looksEncrypted(letter.body)) {
      try {
        const convId = [letter.from_id, user.id].sort().join('_')
        plainBody = await decryptText(convId, letter.body)
      } catch {
        plainBody = '[Unable to decrypt message securely]'
      }
    }
    
    // Strip view timer tag if present
    plainBody = plainBody.replace(/^\[\[view:\d+\]\]\n?/, '')

    setReading({ ...letter, body: plainBody })
    setSecsLeft(parseViewSeconds(letter))
  }

  const finishReading = async () => {
    if (!reading) return
    const letter = reading
    if (timerRef.current) clearInterval(timerRef.current)
    setReading(null)
    setSecsLeft(null)
    await supabase
      .from('letters')
      .update({ read_at: new Date().toISOString() })
      .eq('id', letter.id)
    await supabase.from('letters').delete().eq('id', letter.id)
    setLetters((prev) => prev.filter((l) => l.id !== letter.id))
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
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[520px] h-[400px] bg-cyan-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 right-0 w-[300px] h-[300px] bg-blue-600/10 blur-[100px] rounded-full" />
      </div>
      <div className="relative z-10 max-w-md mx-auto px-4 py-10">
        <button
          onClick={() => router.push('/home')}
          className="inline-flex items-center gap-2 text-sm font-medium text-cyan-400 border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 px-4 py-2.5 rounded-full mb-8 transition"
        >
          ← Back to Home
        </button>
        <h1 className="text-3xl font-bold mb-2">Letters</h1>
        <p className="text-zinc-500 text-sm mb-6">
          Encrypted one-time notes. Read once — timer runs, then gone.
        </p>
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab('inbox')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${
              tab === 'inbox'
                ? 'bg-cyan-500 text-black'
                : 'bg-zinc-900 border border-zinc-800'
            }`}
          >
            Inbox {letters.length > 0 ? `(${letters.length})` : ''}
          </button>
          <button
            onClick={() => {
              setTab('send')
              setMessage('')
              setMessageOk(false)
              setSafetyAlert(false)
            }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${
              tab === 'send'
                ? 'bg-cyan-500 text-black'
                : 'bg-zinc-900 border border-zinc-800'
            }`}
          >
            Send
          </button>
        </div>
        {tab === 'send' ? (
          <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur-sm">
            <div
              className={`rounded-xl border p-3 transition ${
                safetyAlert
                  ? 'border-red-500 bg-red-600/20 ring-2 ring-red-500/50'
                  : 'border-amber-500/25 bg-amber-500/5'
              }`}
            >
              <p
                className={`text-xs mb-2 font-bold uppercase tracking-wide ${
                  safetyAlert ? 'text-red-300' : 'text-amber-100/90'
                }`}
              >
                {safetyAlert ? 'Action required' : 'Safety'}
              </p>
              <ul className="text-[11px] text-zinc-400 space-y-1.5 list-disc pl-4 mb-3">
                <li>Do not share passwords, codes, or payment details.</li>
                <li>Letters are E2E encrypted. Timer deletes them.</li>
                <li>
                  If something feels wrong, do not engage — report when you can.
                </li>
              </ul>
              <p className="text-[11px] font-semibold text-cyan-300/95 leading-relaxed uppercase tracking-wide mb-3">
                NO ONLINE SERVICE CAN GUARANTEE PERFECT SECURITY. DO NOT SHARE
                SECRETS YOU CANNOT AFFORD TO EXPOSE.
              </p>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptedSafety}
                  onChange={(e) => {
                    setAcceptedSafety(e.target.checked)
                    if (e.target.checked) {
                      setSafetyAlert(false)
                      setMessage('')
                      setMessageOk(false)
                    }
                  }}
                  className="mt-0.5 accent-cyan-500"
                />
                <span className="text-[11px] text-zinc-300">
                  I understand — send letter
                </span>
              </label>
            </div>
            {safetyAlert && (
              <div className="rounded-xl border-2 border-red-500 bg-red-600 px-4 py-3.5 text-center shadow-[0_0_24px_rgba(220,38,38,0.35)] animate-pulse">
                <p className="text-sm sm:text-base font-bold text-white tracking-wide">
                  Please confirm the safety note first
                </p>
              </div>
            )}
            <input
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              placeholder="Username or vanish link"
              className="w-full p-3 rounded-xl bg-black/40 border border-zinc-700 text-sm"
            />
            <p className="text-[11px] text-zinc-500">View time after open</p>
            <div className="flex flex-wrap gap-1.5">
              {VIEW_OPTIONS.map((o) => (
                <button
                  key={o.s}
                  type="button"
                  onClick={() => setViewSeconds(o.s)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border ${
                    viewSeconds === o.s
                      ? 'bg-cyan-500 text-black border-cyan-400'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 500))}
              placeholder="Write a one-time letter (max 500)"
              rows={5}
              className="w-full p-3 rounded-xl bg-black/40 border border-zinc-700 text-sm"
            />
            <p className="text-xs text-zinc-500">{body.length}/500</p>
            <button
              onClick={sendLetter}
              className="w-full bg-cyan-500 text-black font-medium py-3 rounded-xl"
            >
              Send letter
            </button>
            {message && !safetyAlert && (
              <div
                className={`rounded-xl px-4 py-3 text-center text-sm font-medium border ${
                  messageOk
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-red-500/10 border-red-500/30 text-red-300'
                }`}
              >
                {message}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {letters.length === 0 ? (
              <p className="text-zinc-500 text-center py-16">No letters</p>
            ) : (
              letters.map((l) => (
                <button
                  key={l.id}
                  onClick={() => openLetter(l)}
                  className="w-full text-left p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 hover:border-cyan-700 transition"
                >
                  <p className="text-sm text-cyan-400">Tap to read once</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    {new Date(l.created_at).toLocaleString()}
                  </p>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {openSafety && !reading && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-950 border border-cyan-500/20 rounded-3xl p-6">
            <h2 className="text-xl font-semibold mb-3">Before you open</h2>
            <ul className="text-sm text-zinc-300 space-y-2 mb-4 list-disc pl-5">
              <li>This letter is encrypted and one-time.</li>
              <li>A timer starts when you open it.</li>
              <li>If something feels wrong, close and do not engage.</li>
            </ul>
            <p className="text-xs sm:text-sm font-semibold text-cyan-300/95 mb-5 leading-relaxed uppercase tracking-wide">
              NO ONLINE SERVICE CAN GUARANTEE PERFECT SECURITY. DO NOT SHARE
              SECRETS YOU CANNOT AFFORD TO EXPOSE.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOpenSafety(null)}
                className="flex-1 bg-zinc-800 py-3 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={acceptOpenSafety}
                className="flex-1 bg-cyan-500 text-black font-medium py-3 rounded-xl"
              >
                I understand — Open
              </button>
            </div>
          </div>
        </div>
      )}
      {reading && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm">
            <div className="rounded-3xl border-2 border-cyan-400/70 bg-zinc-950 shadow-[0_0_48px_rgba(34,211,238,0.22)] overflow-hidden">
              <div className="bg-cyan-500/20 border-b border-cyan-400/40 px-4 py-3 flex items-center justify-between">
                <p className="text-[11px] font-bold text-cyan-300 uppercase tracking-[0.2em]">
                  One-time letter
                </p>
                <p className="text-sm font-semibold text-cyan-200">
                  {secsLeft !== null ? `${secsLeft}s` : ''}
                </p>
              </div>
              <div className="p-5 space-y-4">
                <div className="rounded-2xl bg-zinc-900 border border-zinc-600 px-4 py-3.5">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2 font-medium">
                    Message
                  </p>
                  <p className="text-[15px] leading-relaxed text-zinc-50 whitespace-pre-wrap break-words">
                    {reading.body}
                  </p>
                </div>
                <div className="rounded-xl border border-amber-500/45 bg-amber-500/10 px-3 py-2.5">
                  <p className="text-[10px] font-semibold text-amber-200/95 leading-relaxed uppercase tracking-wide">
                    NO ONLINE SERVICE CAN GUARANTEE PERFECT SECURITY. DO NOT
                    SHARE SECRETS YOU CANNOT AFFORD TO EXPOSE.
                  </p>
                </div>
                <p className="text-[11px] text-zinc-500 text-center">
                  Timer runs even if you leave this screen. Letter vanishes when
                  time hits zero.
                </p>
                <button
                  onClick={finishReading}
                  className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-3 rounded-xl"
                >
                  Done — vanish letter
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {vanishedLetter && !reading && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-zinc-950 border border-cyan-500/30 rounded-3xl p-6 text-center">
            <p className="text-xl font-semibold text-cyan-400 mb-2">
              Letter vanished
            </p>
            <p className="text-sm text-zinc-400 mb-6">
              Time is up. This note is gone.
            </p>
            <button
              type="button"
              onClick={() => setVanishedLetter(false)}
              className="w-full bg-cyan-500 text-black font-semibold py-3 rounded-xl"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}