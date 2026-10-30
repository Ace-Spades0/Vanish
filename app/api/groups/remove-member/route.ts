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
      { global: { headers: { Authorization: authHeader } } }
    )
    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const group_id = body.group_id
    const user_id = body.user_id

    if (!group_id || !user_id) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    if (user_id === user.id) {
      return NextResponse.json(
        { error: 'Use leave to exit yourself' },
        { status: 400 }
      )
    }

    const { data: group } = await service
      .from('vanish_groups')
      .select('id, admin_id, died_at')
      .eq('id', group_id)
      .maybeSingle()

    if (!group || group.died_at) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    if (group.admin_id !== user.id) {
      return NextResponse.json({ error: 'Only admin can remove' }, { status: 403 })
    }

    // Permanent exit row so they cannot rejoin with same link
    try {
      await service.from('vanish_group_exits').upsert(
        {
          group_id,
          user_id,
          exited_at: new Date().toISOString(),
        },
        { onConflict: 'group_id,user_id' }
      )
    } catch {
      /* table optional */
    }

    const { error } = await service
      .from('vanish_group_members')
      .delete()
      .eq('group_id', group_id)
      .eq('user_id', user_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Something went wrong' },
      { status: 500 }
    )
  }
}