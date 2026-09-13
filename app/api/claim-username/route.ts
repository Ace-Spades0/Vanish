import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    const { username } = await req.json()

    if (!username || typeof username !== 'string') {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      )
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
      return NextResponse.json(
        { error: 'You must be logged in' },
        { status: 401 }
      )
    }

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    )

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { error: 'You must be logged in' },
        { status: 401 }
      )
    }

    const { data: existing } = await supabaseAuth
      .from('profiles')
      .select('id')
      .eq('username', cleanUsername)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        {
          error:
            'This username has already been used and cannot be used again',
        },
        { status: 409 }
      )
    }

    const { data: myProfile } = await supabaseAuth
      .from('profiles')
      .select('username, username_claimed_at')
      .eq('id', user.id)
      .maybeSingle()

    if (myProfile?.username && myProfile.username_claimed_at) {
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

    const { error } = await supabaseAuth.from('profiles').upsert({
      id: user.id,
      username: cleanUsername,
      username_claimed_at: new Date().toISOString(),
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Something went wrong' },
      { status: 500 }
    )
  }
}