import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function randomCode(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

export async function POST(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const duration = Number(body.duration_minutes)
  if (![30, 60, 180, 1440].includes(duration)) {
    return NextResponse.json({ error: 'Invalid duration' }, { status: 400 })
  }

  const code = 'G-' + randomCode(6)
  const expires_at = new Date(Date.now() + duration * 60 * 1000).toISOString()

  const { data: group, error } = await supabase
    .from('vanish_groups')
    .insert({
      admin_id: user.id,
      code,
      duration_minutes: duration,
      expires_at,
    })
    .select()
    .single()

  if (error || !group) {
    return NextResponse.json(
      { error: error?.message || 'Could not create group' },
      { status: 500 }
    )
  }

  await supabase.from('vanish_group_members').insert({
    group_id: group.id,
    user_id: user.id,
  })

  const inviteCode = randomCode(10).toLowerCase()
  await supabase.from('vanish_group_invites').insert({
    group_id: group.id,
    code: inviteCode,
    max_uses: 20,
    use_count: 0,
    expires_at,
    created_by: user.id,
  })

  return NextResponse.json({
    success: true,
    group,
    inviteCode,
  })
}