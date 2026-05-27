import { fetchRedis } from '@/helpers/redis'
import type { ApiResponse } from '@groupchat/shared'

/**
 * GET /api/dev/users
 *
 * DEV ONLY. List all test users.
 */
export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return Response.json(
      { ok: false, error: 'Dev-only endpoint' } satisfies ApiResponse<never>,
      { status: 403 },
    )
  }

  try {
    const users: { id: string; name: string; email: string }[] = []

    for (let i = 1; i <= 100; i++) {
      const raw = (await fetchRedis('get', `user:test-user-${i}`)) as string | null
      if (!raw) continue
      try {
        const user = JSON.parse(raw)
        users.push({ id: user.id, name: user.name, email: user.email })
      } catch {}
    }

    return Response.json({ ok: true, data: users } satisfies ApiResponse<typeof users>)
  } catch (error) {
    console.error('[dev/users] Error:', error)
    return Response.json(
      { ok: false, error: 'Failed to list users' } satisfies ApiResponse<never>,
      { status: 500 },
    )
  }
}


