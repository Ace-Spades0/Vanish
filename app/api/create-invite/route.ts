import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function makeCode() {
  return Math.random().toString(36).slice(2, 10)
}

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
        global: { headers: { Authorization: authHeader } },
      }
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
    }

    const inviteCode = makeCode()
    const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('invites')
      .insert({
        code: inviteCode,
        creator_id: user.id,
        expires_at,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      code: data.code,
      url: `/i/${data.code}`,
      expires_at: data.expires_at,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Something went wrong' },
      { status: 500 }
    )
  }
}