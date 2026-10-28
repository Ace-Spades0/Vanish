import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function randomCode(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < len; i++) {
    s += chars[Math.floor(Math.random() * chars.length)]
  }
  return s
}

export async function POST(req: Request) {
  try {
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
    let max_members = Number(body.max_members)
    if (!Number.isFinite(max_members) || max_members < 2) max_members = 20
    if (max_members > 100) max_members = 100
    max_members = Math.floor(max_members)

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
        max_members,
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

    const { error: memberError } = await supabase
      .from('vanish_group_members')
      .insert({
        group_id: group.id,
        user_id: user.id,
      })

    if (memberError) {
      return NextResponse.json(
        { error: memberError.message || 'Could not join group as admin' },
        { status: 500 }
      )
    }

    const inviteCode = randomCode(10).toLowerCase()

    const { error: inviteError } = await supabase
      .from('vanish_group_invites')
      .insert({
        group_id: group.id,
        code: inviteCode,
        max_uses: max_members,
        use_count: 0,
        expires_at,
        created_by: user.id,
      })

    if (inviteError) {
      return NextResponse.json(
        { error: inviteError.message || 'Could not create invite' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      group,
      inviteCode,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Something went wrong' },
      { status: 500 }
    )
  }
}