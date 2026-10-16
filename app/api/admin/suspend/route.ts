import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_IDS = ['a78d8a8e-de03-4159-a3c2-b5788e7cf5b7']

export async function POST(req: Request) {
  const authHeader = req.headers.get('Authorization')
  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: authHeader || '' } },
    }
  )

  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()

  if (!user || !ADMIN_IDS.includes(user.id)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY is not set on the server' },
      { status: 500 }
    )
  }

  const body = await req.json()
  const profileId = String(body.profile_id || '').trim()
  const mode = body.mode as 'timed' | 'permanent' | 'clear'

  if (!profileId) {
    return NextResponse.json({ error: 'Missing profile_id' }, { status: 400 })
  }
  if (!['timed', 'permanent', 'clear'].includes(mode)) {
    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
  }

  if (profileId === user.id) {
    return NextResponse.json(
      { error: 'You cannot suspend your own admin account' },
      { status: 400 }
    )
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey
  )

  let status = 'active'
  let suspended_until: string | null = null

  if (mode === 'permanent') {
    status = 'banned'
    suspended_until = null
  } else if (mode === 'timed') {
    const hours = Number(body.hours) || 24
    status = 'suspended'
    suspended_until = new Date(
      Date.now() + hours * 60 * 60 * 1000
    ).toISOString()
  } else {
    status = 'active'
    suspended_until = null
  }

  const { error } = await db
    .from('profiles')
    .update({
      status,
      suspended_until,
      ...(mode === 'clear' ? { interrogation_strikes: 0 } : {}),
    })
    .eq('id', profileId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await db.from('safety_logs').insert({
    conversation_id: null,
    payload: {
      action: 'admin_suspend',
      admin_id: user.id,
      target_id: profileId,
      mode,
      hours: mode === 'timed' ? body.hours || 24 : null,
      status,
      suspended_until,
    },
  }).catch(() => null)

  return NextResponse.json({
    success: true,
    status,
    suspended_until,
  })
}