import { authenticate } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import { reportSchema } from '@groupchat/shared'
import type { ApiResponse } from '@groupchat/shared'
import { nanoid } from 'nanoid'

/**
 * POST /api/report
 *
 * Report a message or user for moderation.
 */
export async function POST(req: Request) {
  const auth = await authenticate(req)
  if (!auth) {
    return Response.json(
      { ok: false, error: 'Unauthorized' } satisfies ApiResponse<never>,
      { status: 401 },
    )
  }

  try {
    const body = await req.json()
    const parsed = reportSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { ok: false, error: 'Invalid report data' } satisfies ApiResponse<never>,
        { status: 400 },
      )
    }

    const { targetType, targetId, chatId, reason, details } = parsed.data
    const reportId = nanoid()
    const report = {
      id: reportId,
      reporterId: auth.sub,
      targetType,
      targetId,
      chatId: chatId ?? null,
      reason,
      details: details ?? null,
      createdAt: Date.now(),
    }

    await db.zadd('reports:all', {
      score: report.createdAt,
      member: JSON.stringify(report),
    })
    await db.sadd(`reports:user:${auth.sub}`, reportId)

    return Response.json({ ok: true, data: report } satisfies ApiResponse<typeof report>)
  } catch (error) {
    console.error('[report] Error:', error)
    return Response.json(
      { ok: false, error: 'Failed to submit report' } satisfies ApiResponse<never>,
      { status: 500 },
    )
  }
}
