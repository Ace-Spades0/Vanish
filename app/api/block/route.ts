import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  const authHeader = req.headers.get('Authorization')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: authHeader || '' } },
    }
  )
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })

  const { blocked_id, conversation_id } = await req.json()
  if (!blocked_id) {
    return NextResponse.json({ error: 'Missing blocked_id' }, { status: 400 })
  }

  const { error } = await supabase
    .from('blocks')
    .insert({ blocker_id: user.id, blocked_id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Kill live chat between them so Active chats empties
  if (conversation_id) {
    await supabase
      .from('messages')
      .update({ deleted: true, expires_at: new Date().toISOString() })
      .eq('conversation_id', conversation_id)
      .eq('deleted', false)
  } else {
    // Best-effort: any messages I sent or they sent recently not needed —
    // client also deletes by conversation_id
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(req: Request) {
  const authHeader = req.headers.get('Authorization')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: authHeader || '' } },
    }
  )
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
  const { blocked_id } = await req.json()
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', blocked_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
