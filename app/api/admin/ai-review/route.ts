import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_IDS = [
  'a78d8a8e-de03-4159-a3c2-b5788e7cf5b7', // LESTAT
]

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
    'only fan minor',
  ]
  const medium = [
    'threat',
    'hurt you',
    'find you',
    'address',
    'password',
    'send money',
    'crypto',
    'gift card',
    'nude',
    'sex',
    'harass',
    'scam',
    'wire',
  ]
  const spam = ['buy now', 'click here', 'telegram.me', 'whatsapp', 'promo', 'free money']

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
      ? `Local review (${risk}). Signals: ${[...new Set(hits)].slice(0, 8).join(', ')}. Messages in snapshot: ${(snapshot || []).length}. Reason: ${(reason || '').slice(0, 120)}`
      : `Local review (${risk}). No strong keyword signals. Messages in snapshot: ${(snapshot || []).length}. Reason: ${(reason || '').slice(0, 120)}`

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

  const { report_id } = await req.json()
  if (!report_id) {
    return NextResponse.json({ error: 'report_id required' }, { status: 400 })
  }

  const { data: report, error } = await supabase
    .from('reports')
    .select('*')
    .eq('id', report_id)
    .maybeSingle()

  if (error || !report) {
    return NextResponse.json(
      { error: error?.message || 'Report not found' },
      { status: 404 }
    )
  }

  const snapshot = Array.isArray(report.message_snapshot)
    ? report.message_snapshot
    : []

  let result = await openAiReview(report.reason || '', snapshot)
  let engine = 'openai'
  if (!result) {
    result = localReview(report.reason || '', snapshot)
    engine = 'local'
  }

  const { error: upErr } = await supabase
    .from('reports')
    .update({
      ai_status: 'done',
      ai_risk: result.risk,
      ai_summary: `[${engine}] ${result.summary}`,
      ai_reviewed_at: new Date().toISOString(),
    })
    .eq('id', report_id)

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    engine,
    risk: result.risk,
    summary: result.summary,
  })
}