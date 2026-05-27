import { authenticate } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import { deviceTokenSchema } from '@groupchat/shared'
import type { ApiResponse } from '@groupchat/shared'

/**
 * POST /api/push/register
 *
 * Register an APNs device token for the authenticated user.
 * Body: { token: string, platform: 'ios' | 'android' }
 */
export async function POST(req: Request) {
  const auth = await authenticate(req)
  if (!auth) {
    return Response.json(
      { ok: false, error: 'Unauthorized' } satisfies ApiResponse<never>,
      { status: 401 },
    )
  }

  const body = await req.json()
  const parsed = deviceTokenSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: 'Invalid device token data' } satisfies ApiResponse<never>,
      { status: 400 },
    )
  }

  // Store as a set so a user can have multiple devices
  await db.sadd(`user:${auth.sub}:device_tokens`, JSON.stringify({
    token: parsed.data.token,
    platform: parsed.data.platform,
    createdAt: new Date().toISOString(),
  }))

  return Response.json({ ok: true, data: { registered: true } } satisfies ApiResponse<{ registered: boolean }>)
}


