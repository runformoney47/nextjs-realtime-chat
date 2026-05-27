import { authenticate } from '@/lib/auth-guard'
import { getUserById } from '@/lib/user-store'
import type { AppUser, ApiResponse } from '@groupchat/shared'

/**
 * GET /api/auth/me
 *
 * Returns the current authenticated user's profile.
 */
export async function GET(req: Request) {
  const auth = await authenticate(req)
  if (!auth) {
    return Response.json(
      { ok: false, error: 'Unauthorized' } satisfies ApiResponse<never>,
      { status: 401 },
    )
  }

  const user = await getUserById(auth.sub)
  if (!user) {
    return Response.json(
      { ok: false, error: 'User not found' } satisfies ApiResponse<never>,
      { status: 404 },
    )
  }

  const response: ApiResponse<AppUser> = { ok: true, data: user }
  return Response.json(response)
}


