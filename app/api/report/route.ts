import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
    }

    const body = await req.json()
    const reported_id = body.reported_id
    const conversation_id = body.conversation_id || null
    const reason = (body.reason || '').trim() || 'No reason provided'

    if (!reported_id) {
      return NextResponse.json(
        { error: 'Missing reported user' },
        { status: 400 }
      )
    }

    if (reported_id === user.id) {
      return NextResponse.json(
        { error: 'You cannot report yourself' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('reports')
      .insert({
        reporter_id: user.id,
        reported_id,
        conversation_id,
        reason,
        reviewed: false,
      })
      .select('id')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: data.id })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Something went wrong' },
      { status: 500 }
    )
  }
}