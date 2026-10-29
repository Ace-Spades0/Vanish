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
          headers: { Authorization: authHeader },
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
    const code = String(body.code || '')
      .trim()
      .toLowerCase()
    if (!code) {
      return NextResponse.json({ error: 'Missing code' }, { status: 400 })
    }

    const { data: invite, error: invErr } = await supabase
      .from('vanish_group_invites')
      .select('*')
      .eq('code', code)
      .maybeSingle()

    if (invErr || !invite) {
      return NextResponse.json(
        { error: invErr?.message || 'Invite not found' },
        { status: 404 }
      )
    }

    if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: 'Invite expired' }, { status: 400 })
    }

    const maxUses = Number(invite.max_uses || 12)
    const useCount = Number(invite.use_count || 0)
    if (useCount >= maxUses) {
      return NextResponse.json({ error: 'Invite already used up' }, { status: 400 })
    }

    const { data: group, error: gErr } = await supabase
      .from('vanish_groups')
      .select('*')
      .eq('id', invite.group_id)
      .maybeSingle()

    if (gErr || !group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    if (group.died_at) {
      return NextResponse.json({ error: 'Group has vanished' }, { status: 400 })
    }
    if (group.expires_at && new Date(group.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: 'Group has vanished' }, { status: 400 })
    }

    const { data: existing } = await supabase
      .from('vanish_group_members')
      .select('user_id')
      .eq('group_id', group.id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!existing) {
      const { count } = await supabase
        .from('vanish_group_members')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', group.id)

      const maxMembers = Number(group.max_members || 12)
      if ((count || 0) >= maxMembers) {
        return NextResponse.json({ error: 'Group is full' }, { status: 400 })
      }

      const { error: memErr } = await supabase.from('vanish_group_members').insert({
        group_id: group.id,
        user_id: user.id,
      })
      if (memErr) {
        return NextResponse.json({ error: memErr.message }, { status: 500 })
      }

      await supabase
        .from('vanish_group_invites')
        .update({ use_count: useCount + 1 })
        .eq('id', invite.id)
    }

    return NextResponse.json({ success: true, group_id: group.id })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Something went wrong' },
      { status: 500 }
    )
  }
}