import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    let code = String(body.code || '').trim().toLowerCase()
    if (code.includes('/g/')) {
      code = code.split('/g/')[1]?.split(/[?#]/)[0]?.trim().toLowerCase() || ''
    }
    if (!code) {
      return NextResponse.json({ error: 'Invite code required' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser()
    if (userErr || !user) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
    }

    const { data: invite, error: invErr } = await supabase
      .from('vanish_group_invites')
      .select('*')
      .ilike('code', code)
      .maybeSingle()

    if (invErr) {
      return NextResponse.json({ error: invErr.message }, { status: 500 })
    }
    if (!invite) {
      return NextResponse.json(
        { error: 'Group not available. This link may have vanished.' },
        { status: 404 }
      )
    }
    if (invite.revoked_at) {
      return NextResponse.json(
        { error: 'Group not available. This link was revoked.' },
        { status: 410 }
      )
    }
    if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
      return NextResponse.json(
        { error: 'Group not available. This link has expired.' },
        { status: 410 }
      )
    }

    const groupId = invite.group_id

    const { data: group, error: gErr } = await supabase
      .from('vanish_groups')
      .select('*')
      .eq('id', groupId)
      .maybeSingle()

    if (gErr || !group) {
      return NextResponse.json(
        { error: 'Group not available. This group has vanished.' },
        { status: 404 }
      )
    }
    if (group.died_at) {
      return NextResponse.json(
        { error: 'Group not available. This group has vanished.' },
        { status: 410 }
      )
    }
    if (group.expires_at && new Date(group.expires_at).getTime() <= Date.now()) {
      return NextResponse.json(
        { error: 'Group not available. This group has expired.' },
        { status: 410 }
      )
    }

    const { data: exited } = await supabase
      .from('vanish_group_exits')
      .select('user_id')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (exited) {
      return NextResponse.json(
        {
          error:
            'You left this group. You cannot join this group again with this link.',
        },
        { status: 403 }
      )
    }

    const { data: existing } = await supabase
      .from('vanish_group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ success: true, group_id: groupId })
    }

    const { count } = await supabase
      .from('vanish_group_members')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', groupId)

    const max = Math.min(12, Number(group.max_members) || 12)
    if ((count || 0) >= max) {
      return NextResponse.json({ error: 'Group is full' }, { status: 400 })
    }

    const { error: memErr } = await supabase.from('vanish_group_members').insert({
      group_id: groupId,
      user_id: user.id,
      is_admin: false,
    })

    if (memErr) {
      return NextResponse.json({ error: memErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, group_id: groupId })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Join failed' },
      { status: 500 }
    )
  }
}