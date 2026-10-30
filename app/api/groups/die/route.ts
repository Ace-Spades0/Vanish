import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
    }

    const { group_id } = await req.json()
    if (!group_id) {
      return NextResponse.json({ error: 'group_id required' }, { status: 400 })
    }

    const supabaseUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const {
      data: { user },
    } = await supabaseUser.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: group } = await admin
      .from('vanish_groups')
      .select('id, admin_id')
      .eq('id', group_id)
      .maybeSingle()

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }
    if (group.admin_id !== user.id) {
      return NextResponse.json({ error: 'Only admin can end group' }, { status: 403 })
    }

    await admin.from('vanish_group_messages').delete().eq('group_id', group_id)
    await admin.from('vanish_group_members').delete().eq('group_id', group_id)
    await admin.from('vanish_group_exits').delete().eq('group_id', group_id)
    await admin.from('vanish_group_invites').delete().eq('group_id', group_id)
    await admin.from('reports').delete().eq('conversation_id', group_id)
    await admin.from('vanish_groups').delete().eq('id', group_id)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to end group' },
      { status: 500 }
    )
  }
}