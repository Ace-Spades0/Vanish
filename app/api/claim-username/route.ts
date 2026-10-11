import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit, clientKey } from '@/lib/rateLimit'

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

    const rl = rateLimit(`claim:${clientKey(req, user.id)}`, 5, 60_000)
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many attempts. Try again in a minute.' },
        { status: 429 }
      )
    }

    const isAdmin = user.id === ADMIN_ID

    const { data: myProfile } = await supabaseAuth
      .from('profiles')
      .select('username, username_claimed_at, is_permanent_username')
      .eq('id', user.id)
      .maybeSingle()

    if (isAdmin) {
      if (cleanUsername !== ADMIN_PERMANENT_USERNAME) {
        return NextResponse.json(
          { error: 'Admin username is fixed as LESTAT' },
          { status: 400 }
        )
      }

      const { error } = await supabaseAuth.from('profiles').upsert({
        id: user.id,
        username: 'LESTAT',
        username_claimed_at: new Date().toISOString(),
        is_permanent_username: true,
        is_offline: false,
        status: 'active',
      })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      await supabaseAuth.from('used_usernames').upsert(
        {
          username: 'lestat',
          user_id: user.id,
          claimed_at: new Date().toISOString(),
        },
        { onConflict: 'username' }
      )

      return NextResponse.json({ success: true, permanent: true })
    }

    if (myProfile?.username && myProfile.username_claimed_at) {
      if (myProfile.is_permanent_username) {
        return NextResponse.json(
          { error: 'Your username cannot be changed' },
          { status: 400 }
        )
      }
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

    const { data: used } = await supabaseAuth
      .from('used_usernames')
      .select('username, user_id')
      .eq('username', cleanUsername)
      .maybeSingle()

    if (used) {
      return NextResponse.json(
        { error: 'This username has already been used and cannot be reused' },
        { status: 409 }
      )
    }

    const { data: taken } = await supabaseAuth
      .from('profiles')
      .select('id')
      .ilike('username', cleanUsername)
      .neq('id', user.id)
      .maybeSingle()

    if (taken) {
      return NextResponse.json(
        { error: 'This username has already been used and cannot be reused' },
        { status: 409 }
      )
    }

    const { error: upErr } = await supabaseAuth.from('profiles').upsert({
      id: user.id,
      username: cleanUsername,
      username_claimed_at: new Date().toISOString(),
      is_permanent_username: false,
      is_offline: false,
    })

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 })
    }

    const { error: burnErr } = await supabaseAuth.from('used_usernames').upsert(
      {
        username: cleanUsername,
        user_id: user.id,
        claimed_at: new Date().toISOString(),
      },
      { onConflict: 'username' }
    )

    if (burnErr) {
      return NextResponse.json(
        { error: 'Username saved but registry failed: ' + burnErr.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, permanent: false })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Something went wrong' },
      { status: 500 }
    )
  }
}