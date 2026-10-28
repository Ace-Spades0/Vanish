import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
    const duration_minutes = Number(body.duration_minutes)
    const max_members = Number(body.max_members)

    if (!group_id) {
      return NextResponse.json({ error: 'Missing group_id' }, { status: 400 })
    }

    const { data: group } = await supabase
      .from('vanish_groups')
      .select('*')
      .eq('id', group_id)
      .maybeSingle()

    if (!group || group.admin_id !== user.id) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    }

    const patch: any = {}

    if ([30, 60, 180, 1440].includes(duration_minutes)) {
      patch.duration_minutes = duration_minutes
      patch.expires_at = new Date(
        Date.now() + duration_minutes * 60 * 1000
      ).toISOString()
    }

    if (Number.isFinite(max_members) && max_members >= 2 && max_members <= 12) {
      patch.max_members = Math.floor(max_members)
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const { data: updated, error } = await supabase
      .from('vanish_groups')
      .update(patch)
      .eq('id', group_id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, group: updated })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Something went wrong' },
      { status: 500 }
    )
  }
}