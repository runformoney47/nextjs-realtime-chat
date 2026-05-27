import { signToken } from '@/lib/jwt'
import { getUserById } from '@/lib/user-store'
import type { LoginResponse, ApiResponse } from '@groupchat/shared'

/**
 * POST /api/dev/login-as
 *
 * DEV ONLY. Log in as any user by their ID. No verification.
 * Body: { userId: string }
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return Response.json(
      { ok: false, error: 'Dev-only endpoint' } satisfies ApiResponse<never>,
      { status: 403 },
    )
  }

  try {
    const body = await req.json()
    const { userId } = body

    if (!userId) {
      return Response.json(
        { ok: false, error: 'userId is required' } satisfies ApiResponse<never>,
        { status: 400 },
      )
    }

    const user = await getUserById(userId)
    if (!user) {
      return Response.json(
        { ok: false, error: `User ${userId} not found` } satisfies ApiResponse<never>,
        { status: 404 },
      )
    }

    const token = await signToken({
      sub: user.id,
      email: user.email,
      name: user.name,
    })

    return Response.json({
      ok: true,
      data: { token, user },
    } satisfies ApiResponse<LoginResponse>)
  } catch (error) {
    console.error('[dev/login-as] Error:', error)
    return Response.json(
      { ok: false, error: 'Login-as failed' } satisfies ApiResponse<never>,
      { status: 500 },
    )
  }
}
