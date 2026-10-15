import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function localReview(reason: string, snapshot: any[]): {
  risk: string
  summary: string
} {
  const text = [
    reason || '',
    ...(snapshot || []).map((m) =>
      m.type === 'text' ? String(m.content || '') : `[${m.type}]`
    ),
  ]
    .join(' ')
    .toLowerCase()

  const high = [
    'kill',
    'rape',
    'bomb',
    'terror',
    'suicide',
    'child porn',
    'csam',
  ]
  const medium = [
    'threat',
    'hurt you',
    'find you',
    'password',
    'send money',
    'crypto',
    'gift card',
    'nude',
    'harass',
    'scam',
  ]
  const spam = ['buy now', 'click here', 'telegram.me', 'free money']

  let score = 0
  const hits: string[] = []

  for (const w of high) {
    if (text.includes(w)) {
      score += 5
      hits.push(w)
    }
  }
  for (const w of medium) {
    if (text.includes(w)) {
      score += 2
      hits.push(w)
    }
  }
  for (const w of spam) {
    if (text.includes(w)) {
      score += 1
      hits.push(w)
    }
  }
  if (/report|spam|harass|threat|scam|abuse/i.test(reason || '')) {
    score += 1
  }

  const risk = score >= 5 ? 'high' : score >= 2 ? 'medium' : 'low'
  const summary =
    hits.length > 0
      ? `Auto review (${risk}). Signals: ${[...new Set(hits)].slice(0, 8).join(', ')}. Snapshot msgs: ${(snapshot || []).length}. Reason: ${(reason || '').slice(0, 120)}`
      : `Auto review (${risk}). No strong keyword signals. Snapshot msgs: ${(snapshot || []).length}. Reason: ${(reason || '').slice(0, 120)}`

  return { risk, summary }
}

async function openAiReview(
  reason: string,
  snapshot: any[]
): Promise<{ risk: string; summary: string } | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null

  const lines = (snapshot || [])
    .map((m, i) => {
      const body =
        m.type === 'text'
          ? String(m.content || '').slice(0, 500)
          : `[${m.type}]`
      return `${i + 1}. (${m.type}) ${body}`
    })
    .join('\n')

  const prompt = `You moderate a private ephemeral chat app. Given a user report and message snapshot, reply with ONLY JSON:
{"risk":"low"|"medium"|"high","summary":"one short paragraph"}
Do not invent messages. Snapshot may include encrypted ciphertext — say if unreadable.

Report reason: ${reason}

Messages:
${lines || '(none)'}`

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: 'You are a careful trust & safety assistant. Output JSON only.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content || ''
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0])
    const risk = ['low', 'medium', 'high'].includes(parsed.risk)
      ? parsed.risk
      : 'medium'
    return {
      risk,
      summary: String(parsed.summary || 'AI review completed').slice(0, 1000),
    }
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  const authHeader = req.headers.get('Authorization')

  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: authHeader || '' } },
    }
  )

  const {
    data: { user },
  } = await supabaseUser.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
  }

  const body = await req.json()
  const { reported_id, conversation_id, reason, message_id } = body

  if (!reported_id || !reason?.trim()) {
    return NextResponse.json(
      { error: 'reported_id and reason are required' },
      { status: 400 }
    )
  }

  // Do not allow reporting yourself
  if (reported_id === user.id) {
    return NextResponse.json(
      { error: 'You cannot report yourself' },
      { status: 400 }
    )
  }

  let message_snapshot: any[] = []
  if (conversation_id) {
    const { data: rows } = await supabaseUser
      .from('messages')
      .select('id, sender_id, content, type, is_encrypted, created_at, deleted')
      .eq('conversation_id', conversation_id)
      .eq('deleted', false)
      .order('created_at', { ascending: false })
      .limit(30)

    message_snapshot = (rows || []).reverse().map((m) => ({
      id: m.id,
      sender_id: m.sender_id,
      type: m.type,
      is_encrypted: m.is_encrypted,
      created_at: m.created_at,
      content:
        typeof m.content === 'string'
          ? m.content.slice(0, 2000)
          : String(m.content ?? ''),
    }))
  }

  const insertRow: Record<string, any> = {
    reporter_id: user.id,
    reported_id,
    conversation_id: conversation_id || null,
    reason: String(reason).trim().slice(0, 500),
    message_snapshot,
    ai_status: 'pending',
  }
  if (message_id) insertRow.message_id = message_id

  let reportId: string | null = null

  const { data: report, error } = await supabaseUser
    .from('reports')
    .insert(insertRow)
    .select('id')
    .maybeSingle()

  if (error) {
    if (message_id) {
      delete insertRow.message_id
      const { data: report2, error: error2 } = await supabaseUser
        .from('reports')
        .insert(insertRow)
        .select('id')
        .maybeSingle()
      if (error2) {
        return NextResponse.json({ error: error2.message }, { status: 500 })
      }
      reportId = report2?.id || null
    } else {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else {
    reportId = report?.id || null
  }

  // --- A: Auto AI review ---
  let result = await openAiReview(String(reason).trim(), message_snapshot)
  let engine = 'openai'
  if (!result) {
    result = localReview(String(reason).trim(), message_snapshot)
    engine = 'local'
  }

  const ai_summary = `[${engine}] ${result.summary}`
  const ai_risk = result.risk
  const ai_reviewed_at = new Date().toISOString()

  // Prefer service role so AI fields + suspend always write
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseAdmin = serviceKey
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
    : supabaseUser

  if (reportId) {
    await supabaseAdmin
      .from('reports')
      .update({
        ai_status: 'done',
        ai_risk,
        ai_summary,
        ai_reviewed_at,
      })
      .eq('id', reportId)
  }

  // --- B: Auto-suspend if high risk (24h) ---
  let suspended = false
  if (ai_risk === 'high') {
    const suspended_until = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    ).toISOString()

    const { error: suspErr } = await supabaseAdmin
      .from('profiles')
      .update({
        status: 'suspended',
        suspended_until,
      })
      .eq('id', reported_id)

    suspended = !suspErr

    // Optional safety log if table exists
    try {
      await supabaseAdmin.from('safety_logs').insert({
        conversation_id: conversation_id || null,
        payload: {
          action: 'auto_suspend_high_risk',
          report_id: reportId,
          reported_id,
          reporter_id: user.id,
          ai_risk,
          engine,
          suspended_until,
        },
      })
    } catch {
      // table may not exist — ignore
    }
  }

  return NextResponse.json({
    success: true,
    id: reportId,
    ai_risk,
    ai_status: 'done',
    auto_suspended: suspended,
  })
}