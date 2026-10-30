import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function localReview(reason: string, snapshot: any[]): {
  risk: string
  summary: string
  verified: boolean
} {
  const text = [
    reason || '',
    ...(snapshot || []).map((m) =>
      m.type === 'text' ? String(m.content || m.body || '') : `[${m.type}]`
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
    'child sexual',
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
  if (/spam|harass|threat|scam|abuse/i.test(reason || '')) score += 1

  // Require strong signal for high — reduces force/false reports
  const risk = score >= 6 ? 'high' : score >= 2 ? 'medium' : 'low'
  const verified = risk === 'high' && hits.some((h) => high.includes(h))

  const summary =
    hits.length > 0
      ? `Auto review (${risk}${verified ? ', verified' : ''}). Signals: ${[
          ...new Set(hits),
        ]
          .slice(0, 8)
          .join(', ')}. Snapshot: ${(snapshot || []).length} msgs.`
      : `Auto review (${risk}). No strong signals. Snapshot: ${
          (snapshot || []).length
        } msgs.`

  return { risk, summary, verified }
}

async function openAiReview(
  reason: string,
  snapshot: any[]
): Promise<{ risk: string; summary: string; verified: boolean } | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null

  const lines = (snapshot || [])
    .map((m, i) => {
      const body =
        m.type === 'text'
          ? String(m.content || m.body || '').slice(0, 500)
          : `[${m.type}]`
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
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content:
              'Trust & safety for ephemeral chat. Be strict against false/force reports. Output ONLY JSON: {"risk":"low"|"medium"|"high","verified":true|false,"summary":"short"}. Set risk=high and verified=true ONLY when content clearly shows serious harm (CSAM, credible violence/terror threats, clear scam with pressure). Vague insults or single complaints without evidence = low or medium, verified=false.',
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
    const risk = ['low', 'medium', 'high'].includes(parsed.risk)
      ? parsed.risk
      : 'medium'
    const verified = risk === 'high' && parsed.verified === true
    return {
      risk,
      verified,
      summary: String(parsed.summary || 'Done').slice(0, 1000),
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
  if (!UUID_RE.test(String(reported_id))) {
    return NextResponse.json(
      { error: 'Invalid reported user id.' },
      { status: 400 }
    )
  }
  if (reported_id === user.id) {
    return NextResponse.json(
      { error: 'You cannot report yourself' },
      { status: 400 }
    )
  }

  const convId =
    typeof conversation_id === 'string' && conversation_id.length > 0
      ? conversation_id.slice(0, 120)
      : null
  const msgId =
    typeof message_id === 'string' && UUID_RE.test(message_id)
      ? message_id
      : null

  let message_snapshot: any[] = []
  if (convId) {
    // Try 1:1 messages first
    const { data: rows } = await supabaseUser
      .from('messages')
      .select('id, sender_id, content, type, is_encrypted, created_at, deleted')
      .eq('conversation_id', convId)
      .eq('deleted', false)
      .order('created_at', { ascending: false })
      .limit(30)

    if (rows && rows.length > 0) {
      message_snapshot = rows.reverse().map((m) => ({
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
    } else {
      // Group chat snapshot (conversation_id may be group id)
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (serviceKey) {
        const admin = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          serviceKey
        )
        const { data: gRows } = await admin
          .from('vanish_group_messages')
          .select(
            'id, sender_id, body, type, media_url, created_at, deleted'
          )
          .eq('group_id', convId)
          .or('deleted.is.null,deleted.eq.false')
          .order('created_at', { ascending: false })
          .limit(30)
        message_snapshot = (gRows || []).reverse().map((m: any) => ({
          id: m.id,
          sender_id: m.sender_id,
          type: m.type || 'text',
          created_at: m.created_at,
          content:
            typeof m.body === 'string'
              ? m.body.slice(0, 2000)
              : String(m.body ?? ''),
        }))
      }
    }
  }

  const insertRow: Record<string, any> = {
    reporter_id: user.id,
    reported_id,
    conversation_id: convId,
    reason: String(reason).trim().slice(0, 500),
    message_snapshot,
    ai_status: 'pending',
  }
  if (msgId) insertRow.message_id = msgId

  let reportId: string | null = null
  let { data: report, error } = await supabaseUser
    .from('reports')
    .insert(insertRow)
    .select('id')
    .maybeSingle()

  if (error && msgId) {
    delete insertRow.message_id
    const retry = await supabaseUser
      .from('reports')
      .insert(insertRow)
      .select('id')
      .maybeSingle()
    report = retry.data
    error = retry.error
  }

  if (error && convId) {
    const withoutConv = { ...insertRow }
    delete withoutConv.conversation_id
    const retry2 = await supabaseUser
      .from('reports')
      .insert(withoutConv)
      .select('id')
      .maybeSingle()
    if (!retry2.error) {
      report = retry2.data
      error = null
    }
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  reportId = report?.id || null

  let result = await openAiReview(String(reason).trim(), message_snapshot)
  let engine = 'openai'
  if (!result) {
    result = localReview(String(reason).trim(), message_snapshot)
    engine = 'local'
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseAdmin = serviceKey
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
    : supabaseUser

  if (reportId) {
    await supabaseAdmin
      .from('reports')
      .update({
        ai_status: 'done',
        ai_risk: result.risk,
        ai_summary: `[${engine}] ${result.summary}`,
        ai_reviewed_at: new Date().toISOString(),
      })
      .eq('id', reportId)
  }

  // Only remove group message if AI high AND verified (not force reports)
  let removed = false
  if (
    msgId &&
    convId &&
    result.risk === 'high' &&
    result.verified === true &&
    serviceKey
  ) {
    const { data: gMsg } = await supabaseAdmin
      .from('vanish_group_messages')
      .select('id, media_path')
      .eq('id', msgId)
      .eq('group_id', convId)
      .maybeSingle()

    if (gMsg) {
      await supabaseAdmin
        .from('vanish_group_messages')
        .update({
          deleted: true,
          body: '[Removed by verified safety review]',
          media_url: null,
          media_path: null,
        })
        .eq('id', msgId)
      if (gMsg.media_path) {
        try {
          await supabaseAdmin.storage
            .from('chat-photos')
            .remove([gMsg.media_path])
        } catch {
          /* ignore */
        }
      }
      removed = true
    }
  }

  // Rule: 3 high-risk reports in 7 days → suspend 7 days
  let suspended = false
  let highCount = 0
  if (result.risk === 'high') {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: highs } = await supabaseAdmin
      .from('reports')
      .select('id')
      .eq('reported_id', reported_id)
      .eq('ai_risk', 'high')
      .gte('created_at', since)
    highCount = (highs || []).length
    if (highCount >= 3) {
      const suspended_until = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      ).toISOString()
      const { error: suspErr } = await supabaseAdmin
        .from('profiles')
        .update({
          status: 'suspended',
          suspended_until,
        })
        .eq('id', reported_id)
      suspended = !suspErr
      try {
        await supabaseAdmin.from('safety_logs').insert({
          conversation_id: convId,
          payload: {
            action: 'auto_suspend_3_high_reports_7d',
            report_id: reportId,
            reported_id,
            reporter_id: user.id,
            high_count: highCount,
            ai_risk: result.risk,
            engine,
            suspended_until,
          },
        })
      } catch {
        // optional
      }
    }
  }

  return NextResponse.json({
    success: true,
    id: reportId,
    ai_risk: result.risk,
    ai_verified: result.verified === true,
    ai_status: 'done',
    engine,
    removed,
    high_reports_7d: highCount,
    auto_suspended: suspended,
  })
}