import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { applyScheduleDay, getCurrentScheduleDay } from '@/lib/schedule-advance'

/**
 * POST /api/admin/schedule/advance
 * - If dayIndex is provided, applies that day.
 * - Otherwise increments from schedule:current_day (starting at -1).
 *
 * Optional query param:
 * - dayIndex=<number>
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.isAdmin !== true) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

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
      actorUserId: session.user.id,
    })

    return NextResponse.json({ ok: true, ...result }, { status: 200 })
  } catch (error: any) {
    console.error('[Admin][ScheduleAdvance] Failed', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to advance schedule' },
      { status: 500 },
    )
  }
}




