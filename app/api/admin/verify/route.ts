import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  const secret = process.env.ADMIN_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'ADMIN_SECRET is not configured' },
      { status: 500 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const provided = typeof body.secret === 'string' ? body.secret.trim() : ''

  if (!provided || provided !== secret) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 })
  }

  const authHeader = req.headers.get('Authorization')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader || '' } } }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { error: 'Get Started first, then open Admin again' },
      { status: 401 }
    )
  }

  return NextResponse.json({ ok: true, userId: user.id })
}