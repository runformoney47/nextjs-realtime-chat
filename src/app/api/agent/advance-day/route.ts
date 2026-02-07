import { NextResponse } from 'next/server'
import { applyScheduleDay, getCurrentScheduleDay } from '@/lib/schedule-advance'

function isLocalDevRequest(req: Request) {
  const url = new URL(req.url)
  return (
    process.env.NODE_ENV === 'development' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  )
}

function assertAgentAccess(req: Request) {
  if (process.env.AGENT_MODE !== 'true') {
    return { ok: false as const, res: NextResponse.json({ error: 'Not Found' }, { status: 404 }) }
  }

  const secret = process.env.AGENT_API_SECRET
  const provided = req.headers.get('x-agent-secret') ?? ''
  const isLocal = isLocalDevRequest(req)

  if (!isLocal || secret) {
    if (!secret) {
      return {
        ok: false as const,
        res: NextResponse.json({ error: 'Missing AGENT_API_SECRET' }, { status: 500 }),
      }
    }
    if (provided !== secret) {
      return { ok: false as const, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    }
  }

  return { ok: true as const }
}

/**
 * POST /api/agent/advance-day
 * - If dayIndex is provided, applies that day.
 * - Otherwise increments from schedule:current_day (starting at -1).
 *
 * Optional query param:
 * - dayIndex=<number>
 */
export async function POST(req: Request) {
  try {
    const gate = assertAgentAccess(req)
    if (!gate.ok) return gate.res

    const url = new URL(req.url)
    const dayIndexRaw = url.searchParams.get('dayIndex')

    const current = await getCurrentScheduleDay()
    const next =
      dayIndexRaw !== null && dayIndexRaw.length
        ? Number(dayIndexRaw)
        : current + 1

    if (!Number.isFinite(next)) {
      return NextResponse.json({ error: 'Invalid dayIndex' }, { status: 400 })
    }

    const result = await applyScheduleDay({
      dayIndex: next,
      actorUserId: 'agent-system',
    })

    return NextResponse.json({ ok: true, ...result }, { status: 200 })
  } catch (error: any) {
    console.error('[Agent][AdvanceDay] Failed', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to advance day' },
      { status: 500 },
    )
  }
}




