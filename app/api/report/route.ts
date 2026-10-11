import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit, clientKey } from '@/lib/rateLimit'

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

  const rl = rateLimit(`report:${clientKey(req, user.id)}`, 10, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again in a minute.' },
      { status: 429 }
    )
  }

  const { reported_id, conversation_id, reason } = await req.json()

  if (!reported_id || !reason) {
    return NextResponse.json({ error: 'Missing data' }, { status: 400 })
  }

  const { error } = await supabase.from('reports').insert({
    reporter_id: user.id,
    reported_id,
    conversation_id: conversation_id || null,
    reason,
    reviewed: false,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}