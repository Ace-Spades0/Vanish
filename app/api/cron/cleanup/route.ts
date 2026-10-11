import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const now = new Date().toISOString()
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const messages = await supabase
    .from('messages')
    .delete()
    .or(`expires_at.lt.${now},and(deleted.eq.true,created_at.lt.${weekAgo})`)

  const letters = await supabase
    .from('letters')
    .delete()
    .or(`expires_at.lt.${now},read_at.not.is.null`)

  const invites = await supabase
    .from('invites')
    .delete()
    .or(`used_at.not.is.null,expires_at.lt.${now}`)

  return NextResponse.json({
    ok: true,
    messages: messages.error?.message || 'ok',
    letters: letters.error?.message || 'ok',
    invites: invites.error?.message || 'ok',
  })
}