import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Missing Supabase env' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  const now = new Date().toISOString()
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const results: Record<string, string | number | boolean> = {
    ok: true,
    at: now,
  }

  {
    const { error, count } = await supabase
      .from('messages')
      .delete({ count: 'exact' })
      .or(`expires_at.lt.${now},and(deleted.eq.true,created_at.lt.${weekAgo})`)
    results.messages = error ? error.message : count ?? 0
  }

  {
    const { error, count } = await supabase
      .from('letters')
      .delete({ count: 'exact' })
      .or(`expires_at.lt.${now},read_at.not.is.null`)
    results.letters = error ? error.message : count ?? 0
  }

  {
    const { error, count } = await supabase
      .from('invites')
      .delete({ count: 'exact' })
      .or(`used_at.not.is.null,expires_at.lt.${now}`)
    results.invites = error ? error.message : count ?? 0
  }

  {
    const { error, count } = await supabase
      .from('conversation_settings')
      .delete({ count: 'exact' })
      .lt('expires_at', now)
    results.conversation_settings = error ? error.message : count ?? 0
  }

  return NextResponse.json(results)
}