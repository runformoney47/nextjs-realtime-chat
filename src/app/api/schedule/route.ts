import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { saveAppUser } from '@/lib/user-store'

type Schedule = string[][][]

/**
 * GET /api/schedule
 * Returns the current master schedule (if any).
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !session.user?.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const raw = await db.get('schedule:master')
    if (!raw) {
      return NextResponse.json({ schedule: null }, { status: 200 })
    }

    let schedule: Schedule
    if (typeof raw === 'string') {
      schedule = JSON.parse(raw) as Schedule
    } else {
      schedule = raw as Schedule
    }

    return NextResponse.json({ schedule }, { status: 200 })
  } catch (error) {
    console.error('[Schedule][GET] Failed to load master schedule', error)
    return NextResponse.json({ error: 'Failed to load schedule' }, { status: 500 })
  }
}

/**
 * POST /api/schedule
 * Overwrites the current master schedule with the provided one.
 * Body: { schedule: string[][][] }
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !session.user?.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = (await req.json()) as { schedule: unknown }

    // Basic shape validation: 3-level nested arrays of strings.
    const schedule = body.schedule
    if (
      !Array.isArray(schedule) ||
      !schedule.every(
        (day) =>
          Array.isArray(day) &&
          day.every(
            (group) => Array.isArray(group) && group.every((user) => typeof user === 'string'),
          ),
      )
    ) {
      return NextResponse.json(
        { error: 'Invalid schedule format. Expected string[][][]' },
        { status: 400 },
      )
    }

    await db.set('schedule:master', JSON.stringify(schedule))

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('[Schedule][POST] Failed to save master schedule', error)
    return NextResponse.json({ error: 'Failed to save schedule' }, { status: 500 })
  }
}

/**
 * POST /api/schedule?mode=generate
 * Convenience testing endpoint:
 * - Creates a batch of simulated users.
 * - Builds a random schedule using their ids.
 * - Stores that schedule as the master schedule.
 */
export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !session.user?.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Optional overrides via query params (for future flexibility)
    const url = new URL(req.url)
    const totalUsers = Number(url.searchParams.get('users') ?? '20') || 20
    const days = Number(url.searchParams.get('days') ?? '3') || 3
    const groupSize = Number(url.searchParams.get('groupSize') ?? '5') || 5

    // 1) Create simulated users
    const createdUsers: { id: string; name: string; email: string }[] = []

    for (let i = 0; i < totalUsers; i++) {
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2)

      const name = `schedule-user-${i + 1}`
      // Use the same email pattern as the sim-user credentials provider so
      // you can log in as these schedule users via the temp account flow.
      const email = `sim-${encodeURIComponent(name)}@example.com`

      await saveAppUser(
        {
          id,
          name,
          email,
          image: `https://api.dicebear.com/7.x/avataaars/png?seed=${encodeURIComponent(name)}`,
          isOnline: true,
          isSimUser: true,
        },
        { source: 'schedule-generate' },
      )

      createdUsers.push({ id, name, email })
    }

    const userIds = createdUsers.map((u) => u.id)

    // 2) Build random schedule over those ids
    const schedule: Schedule = []

    function shuffled<T>(arr: T[]): T[] {
      const copy = [...arr]
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[copy[i], copy[j]] = [copy[j], copy[i]]
      }
      return copy
    }

    for (let d = 0; d < days; d++) {
      const dayIds = shuffled(userIds)
      const groupsForDay: string[][] = []

      for (let i = 0; i < dayIds.length; i += groupSize) {
        groupsForDay.push(dayIds.slice(i, i + groupSize))
      }

      schedule.push(groupsForDay)
    }

    // 3) Persist as master schedule
    await db.set('schedule:master', JSON.stringify(schedule))

    return NextResponse.json(
      {
        ok: true,
        meta: {
          totalUsers,
          days,
          groupSize,
        },
        createdUsers,
        schedule,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('[Schedule][PUT] Failed to generate test schedule', error)
    return NextResponse.json({ error: 'Failed to generate schedule' }, { status: 500 })
  }
}



