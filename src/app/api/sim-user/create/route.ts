import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fetchRedis } from '@/helpers/redis'

export async function POST(req: Request) {
  try {
    const { username } = (await req.json()) as { username?: string }

    const trimmed = username?.trim()

    if (!trimmed) {
      return NextResponse.json(
        { error: 'USERNAME_REQUIRED' },
        { status: 400 }
      )
    }

    // First, check if a user with this name already exists using the same logic
    // as /api/sim-user/check.
    const keys = (await fetchRedis('keys', 'user:*')) as string[]

    const userKeys = keys.filter((key) => {
      const segments = key.split(':')
      return segments.length === 2 && segments[0] === 'user'
    })

    for (const key of userKeys) {
      const raw = (await fetchRedis('get', key)) as string | null
      if (!raw) continue

      try {
        const parsed = JSON.parse(raw) as { id?: string; name?: string; email?: string }
        if (parsed.name === trimmed) {
          return NextResponse.json({
            created: false,
            alreadyExists: true,
            user: {
              id: parsed.id,
              name: parsed.name,
              email: parsed.email,
            },
          })
        }
      } catch {
        // Ignore malformed records
      }
    }

    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2)

    const email = `sim-${encodeURIComponent(trimmed)}@example.com`

    const userRecord = {
      id,
      name: trimmed,
      email,
      // Use PNG avatars instead of SVG to avoid Next.js dangerouslyAllowSVG warnings.
      image: `https://api.dicebear.com/7.x/avataaars/png?seed=${encodeURIComponent(
        trimmed
      )}`,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      isOnline: true,
      isSimUser: true,
    }

    await db.set(`user:${id}`, JSON.stringify(userRecord))
    await db.set(`user:email:${email}`, id)

    return NextResponse.json({
      created: true,
      alreadyExists: false,
      user: {
        id,
        name: trimmed,
        email,
      },
    })
  } catch (error) {
    console.error('[sim-user][create] failed', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}


