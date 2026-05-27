import { verifyToken } from './jwt'
import type { AuthTokenPayload } from '@groupchat/shared'

/**
 * Extract and verify the Bearer token from an incoming request.
 *
 * Usage in any API route:
 * ```ts
 * const user = await authenticate(req)
 * if (!user) return new Response('Unauthorized', { status: 401 })
 * // user.sub is the userId
 * ```
 */
export async function authenticate(
  req: Request,
): Promise<AuthTokenPayload | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  if (!token) return null

  return verifyToken(token)
}


