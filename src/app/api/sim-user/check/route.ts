import { NextResponse } from 'next/server'
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

    // Find any user record whose "name" matches the provided username.
    // We treat keys of the form "user:<id>" as user records and ignore
    // keys like "user:<id>:friends" or "user:email:<email>".
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
            exists: true,
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

    return NextResponse.json({ exists: false })
  } catch (error) {
    console.error('[sim-user][check] failed', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}


