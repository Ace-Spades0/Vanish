import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function randomCode(len = 10) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
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
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const group_id = body.group_id

    if (!group_id) {
      return NextResponse.json({ error: 'Missing group_id' }, { status: 400 })
    }

    const { data: group } = await supabase
      .from('vanish_groups')
      .select('*')
      .eq('id', group_id)
      .maybeSingle()

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    if (group.admin_id !== user.id) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    }

    if (
      group.died_at ||
      (group.expires_at && new Date(group.expires_at).getTime() <= Date.now())
    ) {
      return NextResponse.json(
        { error: 'This group has already vanished' },
        { status: 400 }
      )
    }

    const code = randomCode(10)

    const { error } = await supabase.from('vanish_group_invites').insert({
      group_id,
      code,
      max_uses: 20,
      use_count: 0,
      expires_at: group.expires_at,
      created_by: user.id,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      code,
      inviteCode: code,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Something went wrong' },
      { status: 500 }
    )
  }
}