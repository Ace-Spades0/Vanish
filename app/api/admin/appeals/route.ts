import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_IDS = ['a78d8a8e-de03-4159-a3c2-b5788e7cf5b7']

export async function GET(req: Request) {
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
  if (!user || !ADMIN_IDS.includes(user.id)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const db = serviceKey
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
    : supabase

  const { data: appeals } = await db
    .from('appeals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  const ids = Array.from(
    new Set((appeals || []).map((a: any) => a.user_id).filter(Boolean))
  )
  const names: Record<string, string> = {}
  if (ids.length) {
    const { data: profiles } = await db
      .from('profiles')
      .select('id, username')
      .in('id', ids)
    ;(profiles || []).forEach((p: any) => {
      names[p.id] = p.username || 'No username'
    })
  }

  return NextResponse.json({ appeals: appeals || [], names })
}

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
  if (!user || !ADMIN_IDS.includes(user.id)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { appeal_id, action, admin_note } = await req.json()
  if (!appeal_id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const db = serviceKey
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
    : supabase

  const { data: appeal } = await db
    .from('appeals')
    .select('*')
    .eq('id', appeal_id)
    .maybeSingle()

  if (!appeal) {
    return NextResponse.json({ error: 'Appeal not found' }, { status: 404 })
  }

  if (action === 'approve') {
    await db
      .from('profiles')
      .update({
        status: 'active',
        suspended_until: null,
        interrogation_strikes: 0,
      })
      .eq('id', appeal.user_id)

    await db
      .from('appeals')
      .update({
        status: 'approved',
        admin_note: admin_note || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', appeal_id)
  } else {
    await db
      .from('appeals')
      .update({
        status: 'rejected',
        admin_note: admin_note || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', appeal_id)
  }

  return NextResponse.json({ success: true })
}