import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const group_id = searchParams.get('group_id')
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
      .select('admin_id')
      .eq('id', group_id)
      .maybeSingle()

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    const { data: rows, error } = await supabase
      .from('vanish_group_members')
      .select('user_id')
      .eq('group_id', group_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const ids = (rows || []).map((r) => r.user_id)
    let profiles: any[] = []
    if (ids.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, username, avatar_icon')
        .in('id', ids)
      profiles = profs || []
    }

    const byId: Record<string, any> = {}
    profiles.forEach((p) => {
      byId[p.id] = p
    })

    const members = ids.map((id) => ({
      user_id: id,
      username: byId[id]?.username || null,
      avatar_icon: byId[id]?.avatar_icon || null,
      is_admin: id === group.admin_id,
    }))

    return NextResponse.json({ members })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
    }

    const { group_id, member_id } = await req.json()
    if (!group_id || !member_id) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
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
      .select('admin_id')
      .eq('id', group_id)
      .maybeSingle()

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    // Self-leave OK; admin can remove others
    if (member_id !== user.id && group.admin_id !== user.id) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    }

    if (member_id === group.admin_id && member_id !== user.id) {
      return NextResponse.json(
        { error: 'Cannot remove admin this way' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('vanish_group_members')
      .delete()
      .eq('group_id', group_id)
      .eq('user_id', member_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed' },
      { status: 500 }
    )
  }
}