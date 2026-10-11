import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit, clientKey } from '@/lib/rateLimit'

function makeCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let code = ''
  for (let i = 0; i < 10; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'You must be logged in' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'You must be logged in' }, { status: 401 })
    }

    const rl = rateLimit(`invite:${clientKey(req, user.id)}`, 10, 60_000)
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many attempts. Try again in a minute.' },
        { status: 429 }
      )
    }

    const code = makeCode()
    const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('invites')
      .insert({
        code,
        creator_id: user.id,
        expires_at,
      })
      .select('code')
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      code: data?.code || code,
      url: `/i/${data?.code || code}`,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Something went wrong' },
      { status: 500 }
    )
  }
}