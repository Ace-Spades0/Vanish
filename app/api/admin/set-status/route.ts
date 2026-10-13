import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_ID = 'a78d8a8e-de03-4159-a3c2-b5788e7cf5b7'

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !anon) {
      return NextResponse.json({ error: 'Missing Supabase env' }, { status: 500 })
    }
    if (!service) {
      return NextResponse.json(
        { error: 'Missing SUPABASE_SERVICE_ROLE_KEY on server' },
        { status: 500 }
      )
    }

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
    }

    if (user.id !== ADMIN_ID) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const body = await req.json()
    const targetId = body?.user_id as string | undefined
    const status = body?.status as 'active' | 'suspended' | 'banned' | undefined
    const hours = typeof body?.hours === 'number' ? body.hours : null

    if (!targetId || !status) {
      return NextResponse.json(
        { error: 'user_id and status required' },
        { status: 400 }
      )
    }

    if (!['active', 'suspended', 'banned'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    // Never suspend/ban LESTAT
    if (targetId === ADMIN_ID && status !== 'active') {
      return NextResponse.json(
        { error: 'Cannot suspend or ban admin' },
        { status: 400 }
      )
    }

    let suspended_until: string | null = null
    if (status === 'suspended' && hours && hours > 0) {
      suspended_until = new Date(
        Date.now() + hours * 60 * 60 * 1000
      ).toISOString()
    }
    if (status === 'active') {
      suspended_until = null
    }
    // permanent suspend or ban → suspended_until stays null

    const admin = createClient(url, service, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { error: updateError } = await admin
      .from('profiles')
      .update({ status, suspended_until })
      .eq('id', targetId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Kick all sessions so they cannot stay “active” in the app
    if (status === 'suspended' || status === 'banned') {
      try {
        await admin.auth.admin.signOut(targetId, 'global')
      } catch {
        // Status still saved even if signOut fails on older API
      }
    }

    return NextResponse.json({
      success: true,
      status,
      suspended_until,
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: 500 }
    )
  }
}