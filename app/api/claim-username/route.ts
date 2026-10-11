import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_ID = 'a78d8a8e-de03-4159-a3c2-b5788e7cf5b7'
const ADMIN_PERMANENT_USERNAME = 'lestat'

export async function POST(req: Request) {
  try {
    const { username } = await req.json()
    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 })
    }

    const cleanUsername = username.trim().toLowerCase()

    if (cleanUsername.length < 3) {
      return NextResponse.json(
        { error: 'Username must be at least 3 characters' },
        { status: 400 }
      )
    }
    if (cleanUsername.length > 20) {
      return NextResponse.json(
        { error: 'Username must be 20 characters or less' },
        { status: 400 }
      )
    }
    if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
      return NextResponse.json(
        { error: 'Username can only contain letters, numbers and underscores' },
        { status: 400 }
      )
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'You must be logged in' }, { status: 401 })
    }

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'You must be logged in' }, { status: 401 })
    }

    const isAdmin = user.id === ADMIN_ID

    const { data: myProfile } = await supabaseAuth
      .from('profiles')
      .select('username, username_claimed_at, is_permanent_username')
      .eq('id', user.id)
      .maybeSingle()

    // Admin permanent name cannot be switched away
    if (isAdmin && myProfile?.is_permanent_username && myProfile.username) {
      if (cleanUsername !== myProfile.username.toLowerCase()) {
        return NextResponse.json(
          { error: 'Your permanent username cannot be changed' },
          { status: 400 }
        )
      }
    }

    // Normal users: block if they still have active 24h name
    if (!isAdmin && myProfile?.username && myProfile.username_claimed_at) {
      const hoursPassed =
        (Date.now() - new Date(myProfile.username_claimed_at).getTime()) /
        (1000 * 60 * 60)
      if (hoursPassed < 24) {
        return NextResponse.json(
          { error: 'You already have an active username' },
          { status: 400 }
        )
      }
    }

    // Burn list: name used by anyone forever (except admin reclaiming lestat)
    const { data: used } = await supabaseAuth
      .from('used_usernames')
      .select('username, user_id')
      .eq('username', cleanUsername)
      .maybeSingle()

    if (used) {
      const adminReclaimingLestat =
        isAdmin &&
        cleanUsername === ADMIN_PERMANENT_USERNAME &&
        used.user_id === user.id
      if (!adminReclaimingLestat) {
        return NextResponse.json(
          { error: 'This username has already been used and cannot be reused' },
          { status: 409 }
        )
      }
    }

    // Also block if another profile currently holds it
    const { data: taken } = await supabaseAuth
      .from('profiles')
      .select('id')
      .ilike('username', cleanUsername)
      .maybeSingle()

    if (taken && taken.id !== user.id) {
      return NextResponse.json(
        { error: 'This username has already been used and cannot be reused' },
        { status: 409 }
      )
    }

    const isPermanent = isAdmin && cleanUsername === ADMIN_PERMANENT_USERNAME
    const finalName = isPermanent ? 'LESTAT' : cleanUsername

    const { error: upErr } = await supabaseAuth.from('profiles').upsert({
      id: user.id,
      username: finalName,
      username_claimed_at: new Date().toISOString(),
      is_permanent_username: isPermanent,
      is_offline: false,
    })

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 })
    }

    // Record burn (lowercase key)
    const { error: burnErr } = await supabaseAuth.from('used_usernames').upsert(
      {
        username: cleanUsername,
        user_id: user.id,
        claimed_at: new Date().toISOString(),
      },
      { onConflict: 'username' }
    )

    if (burnErr) {
      // Profile already set; surface burn failure so you can fix RLS
      return NextResponse.json(
        { error: 'Username saved but registry failed: ' + burnErr.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, permanent: isPermanent })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Something went wrong' },
      { status: 500 }
    )
  }
}