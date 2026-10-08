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
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'You must be logged in' }, { status: 401 })
    }

    const isAdmin = user.id === ADMIN_ID

    // Only admin may use LESTAT
    if (cleanUsername === ADMIN_PERMANENT_USERNAME && !isAdmin) {
      return NextResponse.json(
        { error: 'This username is reserved' },
        { status: 403 }
      )
    }

    // Case-insensitive "already used" check
    const { data: existing } = await supabaseAuth
      .from('profiles')
      .select('id')
      .ilike('username', cleanUsername)
      .maybeSingle()

    if (existing && existing.id !== user.id) {
      return NextResponse.json(
        {
          error: 'This username has already been used and cannot be used again',
        },
        { status: 409 }
      )
    }

    const { data: myProfile } = await supabaseAuth
      .from('profiles')
      .select('username, username_claimed_at, is_permanent_username')
      .eq('id', user.id)
      .maybeSingle()

    // Admin with permanent name cannot switch away
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

    // Admin + lestat = always permanent (never depends on old flag)
    const isPermanent = isAdmin && cleanUsername === ADMIN_PERMANENT_USERNAME

    const { error } = await supabaseAuth.from('profiles').upsert({
      id: user.id,
      username: isPermanent ? 'LESTAT' : cleanUsername,
      username_claimed_at: new Date().toISOString(),
      is_permanent_username: isPermanent,
      is_offline: false,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, permanent: isPermanent })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Something went wrong' },
      { status: 500 }
    )
  }
}