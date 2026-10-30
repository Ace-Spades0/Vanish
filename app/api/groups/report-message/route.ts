import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function localReview(type: string, reason: string, bodyText: string): {
  risk: string
  summary: string
  verified: boolean
} {
  const text = `${type} ${reason} ${bodyText}`.toLowerCase()

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
    'nudes',
    'harass',
    'scam',
    'porn',
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
  if (/spam|harass|threat|scam|abuse|sexual|hate/i.test(type || '')) {
    score += 1
  }

  // High only with strong signal — avoids force reports
  const risk = score >= 6 ? 'high' : score >= 2 ? 'medium' : 'low'
  const verified = risk === 'high' && hits.some((h) => high.includes(h))

  const summary =
    hits.length > 0
      ? `Group msg review (${risk}${verified ? ', verified' : ''}). Signals: ${[
          ...new Set(hits),
        ]
          .slice(0, 8)
          .join(', ')}.`
      : `Group msg review (${risk}). No strong signals.`

  return { risk, summary, verified }
}

async function openAiReview(
  type: string,
  reason: string,
  bodyText: string
): Promise<{ risk: string; summary: string; verified: boolean } | null> {
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
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content:
              'Trust & safety for group chat. Be strict against false/force reports. Output ONLY JSON: {"risk":"low"|"medium"|"high","verified":true|false,"summary":"short"}. risk=high and verified=true ONLY for clear CSAM, credible violence/terror, or clear scam with pressure. Insults or weak complaints = low/medium, verified=false.',
          },
          {
            role: 'user',
            content: `Report type: ${type}\nReason: ${reason}\nMessage body: ${bodyText || '(none or media)'}`,
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
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const group_id = body.group_id
    const message_id = body.message_id
    const report_type = String(body.report_type || 'Other')
    const reason = String(body.reason || '').slice(0, 400)
    // optional: who to notify — admin path always stores for group admin
    const target = String(body.target || 'admin') // admin | platform | both

    if (!group_id || !message_id || !reason.trim()) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const { data: membership } = await supabase
      .from('vanish_group_members')
      .select('user_id')
      .eq('group_id', group_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 })
    }

    const { data: msg } = await service
      .from('vanish_group_messages')
      .select('*')
      .eq('id', message_id)
      .eq('group_id', group_id)
      .maybeSingle()

    if (!msg) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    const bodyText =
      typeof msg.body === 'string' ? msg.body.slice(0, 2000) : ''

    // Always store report for admin notification (message stays unless AI high+verified)
    await service.from('reports').insert({
      reporter_id: user.id,
      reported_id: msg.sender_id,
      conversation_id: group_id,
      reason: `[GROUP MSG] ${report_type}: ${reason} | message_id:${message_id}`,
      ai_status: 'pending',
    })

    let result = await openAiReview(report_type, reason, bodyText)
    let engine = 'openai'
    if (!result) {
      result = localReview(report_type, reason, bodyText)
      engine = 'local'
    }

    // Update latest matching report with AI result (best-effort)
    try {
      const { data: last } = await service
        .from('reports')
        .select('id')
        .eq('reporter_id', user.id)
        .eq('reported_id', msg.sender_id)
        .eq('conversation_id', group_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (last?.id) {
        await service
          .from('reports')
          .update({
            ai_status: 'done',
            ai_risk: result.risk,
            ai_summary: `[${engine}] ${result.summary}`,
            ai_reviewed_at: new Date().toISOString(),
          })
          .eq('id', last.id)
      }
    } catch {
      /* optional columns */
    }

    // Remove ONLY when AI risk is high AND verified — not on keyword-only force reports
    let removed = false
    if (result.risk === 'high' && result.verified === true) {
      await service
        .from('vanish_group_messages')
        .update({
          deleted: true,
          body: '[Removed by verified safety review]',
          media_url: null,
          media_path: null,
        })
        .eq('id', message_id)

      if (msg.media_path) {
        try {
          await service.storage.from('chat-photos').remove([msg.media_path])
        } catch {
          /* ignore */
        }
      }
      removed = true
    }

    return NextResponse.json({
      success: true,
      removed,
      critical: removed,
      ai_risk: result.risk,
      ai_verified: result.verified === true,
      engine,
      target,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Something went wrong' },
      { status: 500 }
    )
  }
}