import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const CRITICAL = [
  'porn',
  'pornography',
  'child',
  'csam',
  'nude',
  'nudes',
  'sexual',
  'rape',
  'terror',
  'bomb',
  'kill yourself',
  'kys',
]

function isCritical(type: string, reason: string) {
  const t = `${type} ${reason}`.toLowerCase()
  if (
    type.toLowerCase().includes('sexual') ||
    type.toLowerCase().includes('hate')
  ) {
    return true
  }
  return CRITICAL.some((k) => t.includes(k))
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

    await service.from('reports').insert({
      reporter_id: user.id,
      reported_id: msg.sender_id,
      conversation_id: group_id,
      reason: `[GROUP MSG] ${report_type}: ${reason}`,
    })

    let removed = false
    if (isCritical(report_type, reason)) {
      await service
        .from('vanish_group_messages')
        .update({
          deleted: true,
          body: '[Removed by safety review]',
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
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Something went wrong' },
      { status: 500 }
    )
  }
}