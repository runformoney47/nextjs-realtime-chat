import { createRemoteJWKSet, jwtVerify } from 'jose'

const APPLE_ISSUER = 'https://appleid.apple.com'
const APPLE_JWKS = createRemoteJWKSet(new URL(`${APPLE_ISSUER}/auth/keys`))

export type AppleIdentityClaims = {
  sub: string
  email?: string
  email_verified?: boolean | string
  is_private_email?: boolean | string
}

/**
 * Verify an Apple Sign-In identity token (JWT) using Apple's public JWKS.
 *
 * @see https://developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_rest_api/verifying_a_user
 */
export async function verifyAppleIdentityToken(
  identityToken: string,
): Promise<AppleIdentityClaims | null> {
  const audience = process.env.APPLE_BUNDLE_ID ?? 'com.groupchat.app'

  try {
    const { payload } = await jwtVerify(identityToken, APPLE_JWKS, {
      issuer: APPLE_ISSUER,
      audience,
    })

    const sub = payload.sub
    if (!sub || typeof sub !== 'string') return null

    return {
      sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      email_verified: payload.email_verified as boolean | string | undefined,
      is_private_email: payload.is_private_email as boolean | string | undefined,
    }
  } catch (error) {
    console.error('[apple-auth] Token verification failed:', error)
    return null
  }
}
