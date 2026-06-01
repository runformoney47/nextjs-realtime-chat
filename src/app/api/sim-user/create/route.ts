import { NextResponse } from 'next/server'
import { fetchRedis } from '@/helpers/redis'
import { saveAppUser } from '@/lib/user-store'

export async function POST(req: Request) {
  try {
    // Clone the request before reading the body to avoid Undici #state issues
    // when the body stream has already been touched by internal Next.js logic.
    let username: string | undefined
    try {
      const clone = req.clone()
      const body = (await clone.json()) as { username?: string }
      username = body.username
    } catch {
      username = undefined
    }

    const trimmed = username?.trim()

    // If no username was provided, generate a random one.
    const finalName =
      trimmed && trimmed.length > 0
        ? trimmed
        : `user-${Math.random().toString(36).slice(2, 8)}`

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
        if (parsed.name === finalName) {
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

    const email = `sim-${encodeURIComponent(finalName)}@example.com`

    await saveAppUser(
      {
        id,
        name: finalName,
        email,
        // Use PNG avatars instead of SVG to avoid Next.js dangerouslyAllowSVG warnings.
        image: `https://api.dicebear.com/7.x/avataaars/png?seed=${encodeURIComponent(
          finalName,
        )}`,
        isOnline: true,
        isSimUser: true,
      },
      { source: 'sim-user-create' },
    )

    return NextResponse.json({
      created: true,
      alreadyExists: false,
      user: {
        id,
        name: finalName,
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


