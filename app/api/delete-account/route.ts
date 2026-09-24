import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
    }

    const supabaseUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
    }

    const userId = user.id

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Delete related data first (with admin rights)
    await supabaseAdmin.from('messages').delete().eq('sender_id', userId)
    await supabaseAdmin.from('blocks').delete().eq('blocker_id', userId)
    await supabaseAdmin.from('blocks').delete().eq('blocked_id', userId)
    await supabaseAdmin.from('reports').delete().eq('reporter_id', userId)
    await supabaseAdmin.from('reports').delete().eq('reported_id', userId)
    await supabaseAdmin.from('profiles').delete().eq('id', userId)

    // Now delete auth user
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Delete failed' }, { status: 500 })
  }
}