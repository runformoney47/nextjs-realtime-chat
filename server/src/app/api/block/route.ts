import { authenticate } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import { blockUserSchema } from '@groupchat/shared'
import type { ApiResponse } from '@groupchat/shared'

/**
 * POST /api/block
 * DELETE /api/block
 *
 * Block or unblock a user. Blocked users' messages are hidden on client side.
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
    const parsed = blockUserSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { ok: false, error: 'Invalid request' } satisfies ApiResponse<never>,
        { status: 400 },
      )
    }

    const { userId } = parsed.data
    if (userId === auth.sub) {
      return Response.json(
        { ok: false, error: 'Cannot block yourself' } satisfies ApiResponse<never>,
        { status: 400 },
      )
    }

    await db.sadd(`blocks:${auth.sub}`, userId)
    return Response.json({ ok: true, data: { blocked: true, userId } } satisfies ApiResponse<{ blocked: boolean; userId: string }>)
  } catch (error) {
    console.error('[block] Error:', error)
    return Response.json(
      { ok: false, error: 'Failed to block user' } satisfies ApiResponse<never>,
      { status: 500 },
    )
  }
}

export async function DELETE(req: Request) {
  const auth = await authenticate(req)
  if (!auth) {
    return Response.json(
      { ok: false, error: 'Unauthorized' } satisfies ApiResponse<never>,
      { status: 401 },
    )
  }

  try {
    const body = await req.json()
    const parsed = blockUserSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { ok: false, error: 'Invalid request' } satisfies ApiResponse<never>,
        { status: 400 },
      )
    }

    const { userId } = parsed.data
    await db.srem(`blocks:${auth.sub}`, userId)
    return Response.json({ ok: true, data: { blocked: false, userId } } satisfies ApiResponse<{ blocked: boolean; userId: string }>)
  } catch (error) {
    console.error('[block] Error:', error)
    return Response.json(
      { ok: false, error: 'Failed to unblock user' } satisfies ApiResponse<never>,
      { status: 500 },
    )
  }
}
