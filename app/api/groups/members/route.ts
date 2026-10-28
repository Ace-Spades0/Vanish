import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: Request) {
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

    const { searchParams } = new URL(req.url)
    const group_id = searchParams.get('group_id')
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

    const { data: members, error } = await supabase
      .from('vanish_group_members')
      .select('user_id, joined_at')
      .eq('group_id', group_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const ids = (members || []).map((m) => m.user_id)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, avatar_icon')
      .in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])

    const list = (members || []).map((m) => {
      const p = (profiles || []).find((x) => x.id === m.user_id)
      return {
        user_id: m.user_id,
        username: p?.username || 'Unknown',
        avatar_icon: p?.avatar_icon || '🎭',
        is_admin: m.user_id === group.admin_id,
      }
    })

    return NextResponse.json({ success: true, members: list })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Something went wrong' },
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
    const group_id = body.group_id
    const member_id = body.member_id

    if (!group_id || !member_id) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const { data: group } = await supabase
      .from('vanish_groups')
      .select('*')
      .eq('id', group_id)
      .maybeSingle()

    if (!group || group.admin_id !== user.id) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    }

    if (member_id === group.admin_id) {
      return NextResponse.json(
        { error: 'Cannot remove the group admin' },
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
      { error: err?.message || 'Something went wrong' },
      { status: 500 }
    )
  }
}