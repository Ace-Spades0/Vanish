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
  if (!user) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
  }

  const body = await req.json()
  const { reported_id, conversation_id, reason, message_id } = body

  if (!reported_id || !reason?.trim()) {
    return NextResponse.json(
      { error: 'reported_id and reason are required' },
      { status: 400 }
    )
  }

  // Snapshot of recent messages for AI / admin (only what still exists)
  let message_snapshot: any[] = []
  if (conversation_id) {
    const { data: rows } = await supabase
      .from('messages')
      .select('id, sender_id, content, type, is_encrypted, created_at, deleted')
      .eq('conversation_id', conversation_id)
      .eq('deleted', false)
      .order('created_at', { ascending: false })
      .limit(30)

    message_snapshot = (rows || []).reverse().map((m) => ({
      id: m.id,
      sender_id: m.sender_id,
      type: m.type,
      is_encrypted: m.is_encrypted,
      created_at: m.created_at,
      // Text may be ciphertext; media is URL. Admin/AI use as-is.
      content:
        typeof m.content === 'string'
          ? m.content.slice(0, 2000)
          : String(m.content ?? ''),
    }))
  }

  const insertRow: Record<string, any> = {
    reporter_id: user.id,
    reported_id,
    conversation_id: conversation_id || null,
    reason: String(reason).trim().slice(0, 500),
    message_snapshot,
    ai_status: 'pending',
  }

  // Optional column if you added message_id on reports
  if (message_id) {
    insertRow.message_id = message_id
  }

  const { data: report, error } = await supabase
    .from('reports')
    .insert(insertRow)
    .select('id')
    .maybeSingle()

  if (error) {
    // Retry without message_id if column missing
    if (message_id) {
      delete insertRow.message_id
      const { data: report2, error: error2 } = await supabase
        .from('reports')
        .insert(insertRow)
        .select('id')
        .maybeSingle()
      if (error2) {
        return NextResponse.json({ error: error2.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, id: report2?.id })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, id: report?.id })
}