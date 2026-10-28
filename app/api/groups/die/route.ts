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

    if (!group_id) {
      return NextResponse.json({ error: 'Missing group_id' }, { status: 400 })
    }

    const now = new Date().toISOString()

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

    await supabase
      .from('vanish_groups')
      .update({ died_at: now, expires_at: now })
      .eq('id', group_id)

    await supabase.from('vanish_group_messages').delete().eq('group_id', group_id)
    await supabase.from('vanish_group_invites').delete().eq('group_id', group_id)
    await supabase.from('vanish_group_members').delete().eq('group_id', group_id)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Something went wrong' },
      { status: 500 }
    )
  }
}