import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
    }

    const supabaseAuth = createClient(
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
      error: userError,
    } = await supabaseAuth.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
    }

    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const userId = user.id
    const now = new Date().toISOString()

    // --- Kill every vanishing group this user admins ---
    const { data: ownedGroups } = await service
      .from('vanish_groups')
      .select('id')
      .eq('admin_id', userId)

    for (const g of ownedGroups || []) {
      await service
        .from('vanish_groups')
        .update({ died_at: now, expires_at: now })
        .eq('id', g.id)

      await service.from('vanish_group_messages').delete().eq('group_id', g.id)
      await service.from('vanish_group_invites').delete().eq('group_id', g.id)
      await service.from('vanish_group_members').delete().eq('group_id', g.id)
    }

    // Remove membership in other groups (group can stay if another admin exists)
    await service.from('vanish_group_members').delete().eq('user_id', userId)

    // --- One-time letters ---
    await service.from('letters').delete().eq('from_id', userId)
    await service.from('letters').delete().eq('to_id', userId)

    // --- Invites (1:1 vanish links) if table exists ---
    try {
      await service.from('invites').delete().eq('created_by', userId)
    } catch {
      /* table may differ */
    }

    // --- Blocks ---
    try {
      await service.from('blocks').delete().eq('blocker_id', userId)
      await service.from('blocks').delete().eq('blocked_id', userId)
    } catch {
      /* optional */
    }

    // --- Reports (keep for safety history, or delete — here we null reporter only if needed)
    // Optional: leave reports for admin audit

    // --- Messages sent by user ---
    try {
      await service.from('messages').delete().eq('sender_id', userId)
    } catch {
      /* optional */
    }

    // --- Conversation settings / conversations if present ---
    try {
      await service.from('conversation_settings').delete().eq('user_id', userId)
    } catch {
      /* optional */
    }

    // --- Profile ---
    await service.from('profiles').delete().eq('id', userId)

    // --- Auth user (full wipe) ---
    const { error: delAuthError } = await service.auth.admin.deleteUser(userId)
    if (delAuthError) {
      return NextResponse.json(
        {
          error:
            delAuthError.message ||
            'Data cleared but auth user could not be removed',
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Something went wrong' },
      { status: 500 }
    )
  }
}