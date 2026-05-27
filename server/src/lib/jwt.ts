import { SignJWT, jwtVerify } from 'jose'
import type { AuthTokenPayload } from '@groupchat/shared'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'dev-secret-change-me-in-production',
)

/** How long access tokens are valid. */
const TOKEN_EXPIRY = '30d'

/**
 * Issue a signed JWT for a user.
 */
export async function signToken(payload: {
  sub: string
  email: string
  name: string
}): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(JWT_SECRET)
}

/**
 * Verify and decode a JWT. Returns null if invalid/expired.
 */
export async function verifyToken(
  token: string,
): Promise<AuthTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as AuthTokenPayload
  } catch {
    return null
  }
}


