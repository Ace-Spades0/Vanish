import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_IDS = ['a78d8a8e-de03-4159-a3c2-b5788e7cf5b7']

function localReview(reason: string, snapshot: any[]) {
  const text = [
    reason || '',
    ...(snapshot || []).map((m) =>
      m.type === 'text' ? String(m.content || '') : `[${m.type}]`
    ),
  ]
    .join(' ')
    .toLowerCase()

  const high = ['kill', 'rape', 'bomb', 'terror', 'suicide', 'child porn', 'csam']
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
  if (/report|spam|harass|threat|scam|abuse/i.test(reason || '')) score += 1

  const risk = score >= 5 ? 'high' : score >= 2 ? 'medium' : 'low'
  const summary =
    hits.length > 0
      ? `Re-review (${risk}). Signals: ${[...new Set(hits)].slice(0, 8).join(', ')}. Msgs: ${(snapshot || []).length}`
      : `Re-review (${risk}). No strong signals. Msgs: ${(snapshot || []).length}`

  return { risk, summary }
}

async function openAiReview(reason: string, snapshot: any[]) {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  const lines = (snapshot || [])
    .map((m, i) => {
      const body =
        m.type === 'text' ? String(m.content || '').slice(0, 500) : `[${m.type}]`
      return `${i + 1}. (${m.type}) ${body}`
    })
    .join('\n')

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
            content: 'Trust & safety assistant. Output JSON only: {"risk":"low"|"medium"|"high","summary":"..."}',
          },
          {
            role: 'user',
            content: `Reason: ${reason}\n\nMessages:\n${lines || '(none)'}`,
          },
        ],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content || ''
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0])
    return {
      risk: ['low', 'medium', 'high'].includes(parsed.risk) ? parsed.risk : 'medium',
      summary: String(parsed.summary || 'Done').slice(0, 1000),
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
    { global: { headers: { Authorization: authHeader || '' } } }
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

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const db = serviceKey
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
    : supabase

  await db
    .from('reports')
    .update({
      ai_status: 'done',
      ai_risk: result.risk,
      ai_summary: `[${engine}] ${result.summary}`,
      ai_reviewed_at: new Date().toISOString(),
    })
    .eq('id', report_id)

  if (result.risk === 'high' && report.reported_id) {
    const suspended_until = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    ).toISOString()
    await db
      .from('profiles')
      .update({ status: 'suspended', suspended_until })
      .eq('id', report.reported_id)
  }

  return NextResponse.json({
    success: true,
    engine,
    risk: result.risk,
    summary: result.summary,
  })
}