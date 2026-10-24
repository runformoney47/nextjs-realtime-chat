import { authenticate } from '@/lib/auth-guard'
import { fetchRedis } from '@/helpers/redis'
import type { ApiResponse } from '@groupchat/shared'

/**
 * GET /api/block/list
 *
 * Get list of blocked user IDs.
 */
export async function GET(req: Request) {
  const auth = await authenticate(req)
  if (!auth) {
    return Response.json(
      { ok: false, error: 'Unauthorized' } satisfies ApiResponse<never>,
      { status: 401 },
    )
  }

  try {
    const blocked = ((await fetchRedis('smembers', `blocks:${auth.sub}`)) as string[] | null) ?? []
    return Response.json({ ok: true, data: { blocked } } satisfies ApiResponse<{ blocked: string[] }>)
  } catch (error) {
    console.error('[block/list] Error:', error)
    return Response.json(
      { ok: false, error: 'Failed to fetch blocked users' } satisfies ApiResponse<never>,
      { status: 500 },
    )
  }
}
