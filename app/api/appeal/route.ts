import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const MS_24H = 24 * 60 * 60 * 1000

/** Simple local check: sincere appeal vs empty/spam */
function localAppealScore(text: string): {
  approve: boolean
  summary: string
} {
  const t = text.toLowerCase()
  const len = text.trim().length
  const spam =
    /(https?:\/\/|buy followers|crypto giveaway|whatsapp me)/i.test(t)
  const abusive = /(kill you|bomb|nazi|rape)/i.test(t)
  const sincere =
    len >= 40 &&
    /(sorry|mistake|please|account|wrong|appeal|understand|won't|will not|apolog)/i.test(
      t
    )

  if (spam || abusive) {
    return {
      approve: false,
      summary: 'Local AI: appeal rejected (spam or severe language).',
    }
  }
  if (sincere || len >= 80) {
    return {
      approve: true,
      summary:
        'Local AI: appeal accepted — message looks substantive. Human can reverse.',
    }
  }
  return {
    approve: false,
    summary:
      'Local AI: left pending — appeal too short or unclear for auto-restore.',
  }
}

async function openAiAppealScore(
  text: string
): Promise<{ approve: boolean; summary: string } | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'You review account suspension appeals for a private chat app. Reply JSON only: {"approve":boolean,"summary":"one short sentence"}. Approve only if the user seems sincere and not threatening/spam. Do not approve vague one-liners.',
          },
          { role: 'user', content: text.slice(0, 500) },
        ],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content || ''
    const json = JSON.parse(raw.replace(/```json|```/g, '').trim())
    return {
      approve: !!json.approve,
      summary: String(json.summary || 'OpenAI appeal review').slice(0, 200),
    }
  } catch {
    return null
  }
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
  if (!user) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
  }

  const body = await req.json()
  const text = String(body.message || '').trim().slice(0, 500)
  if (text.length < 10) {
    return NextResponse.json(
      { error: 'Please write at least 10 characters' },
      { status: 400 }
    )
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json(
      { error: 'Server misconfigured (service role)' },
      { status: 500 }
    )
  }
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey
  )

  const { data: profile } = await db
    .from('profiles')
    .select('status, suspended_until')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.status !== 'suspended' && profile?.status !== 'banned') {
    return NextResponse.json(
      { error: 'Account is not suspended' },
      { status: 400 }
    )
  }

  const { data: existing } = await db
    .from('appeals')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'You already have a pending appeal' },
      { status: 400 }
    )
  }

  const isBanned = profile?.status === 'banned'
  const untilMs = profile?.suspended_until
    ? new Date(profile.suspended_until).getTime()
    : null
  const remaining = untilMs ? untilMs - Date.now() : 0

  // ≤24h timed suspend: AI must NOT auto-unsuspend — pending for human only
  const shortTimedSuspend =
    !isBanned && remaining > 0 && remaining <= MS_24H

  if (shortTimedSuspend) {
    const { error } = await db.from('appeals').insert({
      user_id: user.id,
      message: text,
      status: 'pending',
      admin_note:
        'Short suspension (≤24h): AI cannot auto-restore. Human review only.',
    })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({
      success: true,
      auto_restored: false,
      ai_eligible: false,
      message:
        'Appeal submitted. Short suspensions stay in place unless a human restores access, or the timer ends.',
    })
  }

  // >24h remaining OR ban: AI may read appeal and restore if OK
  const oi = await openAiAppealScore(text)
  const decision = oi || localAppealScore(text)

  if (decision.approve) {
    const { error: insErr } = await db.from('appeals').insert({
      user_id: user.id,
      message: text,
      status: 'approved',
      admin_note: `${decision.summary} (Human can reverse in Admin → Appeals.)`,
      reviewed_at: new Date().toISOString(),
    })
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }

    await db
      .from('profiles')
      .update({
        status: 'active',
        suspended_until: null,
        interrogation_strikes: 0,
      })
      .eq('id', user.id)

    try {
      await db.from('safety_logs').insert({
        conversation_id: null,
        payload: {
          action: 'ai_appeal_auto_restore',
          user_id: user.id,
          was_banned: isBanned,
          remaining_ms: remaining,
          summary: decision.summary,
        },
      })
    } catch {
      /* optional */
    }

    return NextResponse.json({
      success: true,
      auto_restored: true,
      ai_eligible: true,
      summary: decision.summary,
    })
  }

  // AI did not approve → pending for human
  const { error } = await db.from('appeals').insert({
    user_id: user.id,
    message: text,
    status: 'pending',
    admin_note: decision.summary,
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    auto_restored: false,
    ai_eligible: true,
    message:
      'Appeal submitted for review. Automated checks did not restore access yet.',
  })
}

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
  if (!user) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const db = serviceKey
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
    : supabase

  const { data } = await db
    .from('appeals')
    .select('id, message, status, created_at, admin_note')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5)

  return NextResponse.json({ appeals: data || [] })
}