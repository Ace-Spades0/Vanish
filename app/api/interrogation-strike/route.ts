import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Called when a user hits an anti-interrogation LIMIT in a chat
 * (after warnings — short expiry applied).
 * After 2 limits on the same account → suspend 24 hours.
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get('Authorization')

  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: authHeader || '' } },
    }
  )

  const {
    data: { user },
  } = await supabaseUser.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
  }

  let conversation_id: string | null = null
  try {
    const body = await req.json()
    if (typeof body?.conversation_id === 'string') {
      conversation_id = body.conversation_id.slice(0, 120)
    }
  } catch {
    // no body ok
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const db = serviceKey
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
    : supabaseUser

  const { data: profile, error } = await db
    .from('profiles')
    .select('id, interrogation_strikes, status')
    .eq('id', user.id)
    .maybeSingle()

  if (error || !profile) {
    return NextResponse.json(
      { error: error?.message || 'Profile not found' },
      { status: 500 }
    )
  }

  const prev = Number(profile.interrogation_strikes || 0)
  const next = prev + 1

  let suspended = false
  let suspended_until: string | null = null

  if (next >= 2) {
    suspended_until = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    ).toISOString()

    const { error: upErr } = await db
      .from('profiles')
      .update({
        interrogation_strikes: next,
        status: 'suspended',
        suspended_until,
      })
      .eq('id', user.id)

    suspended = !upErr
  } else {
    await db
      .from('profiles')
      .update({ interrogation_strikes: next })
      .eq('id', user.id)
  }

  try {
    await db.from('safety_logs').insert({
      conversation_id,
      payload: {
        action: 'interrogation_limit_strike',
        user_id: user.id,
        strikes: next,
        suspended,
        suspended_until,
      },
    })
  } catch {
    // optional
  }

  return NextResponse.json({
    success: true,
    strikes: next,
    suspended,
    suspended_until,
  })
}