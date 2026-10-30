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

    const { data: group } = await supabase
      .from('vanish_groups')
      .select('*')
      .eq('id', group_id)
      .maybeSingle()

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }
    if (group.admin_id !== user.id) {
      return NextResponse.json({ error: 'Only admin can end the group' }, { status: 403 })
    }

    // Wipe everything tied to THIS group id, then delete the group
    await supabase.from('vanish_group_messages').delete().eq('group_id', group_id)
    await supabase.from('vanish_group_members').delete().eq('group_id', group_id)
    await supabase.from('vanish_group_exits').delete().eq('group_id', group_id)
    await supabase.from('vanish_group_invites').delete().eq('group_id', group_id)
    await supabase.from('reports').delete().eq('conversation_id', group_id)
    await supabase.from('vanish_groups').delete().eq('id', group_id)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Something went wrong' },
      { status: 500 }
    )
  }
}