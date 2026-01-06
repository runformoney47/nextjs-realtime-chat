import { NextRequest, NextResponse } from 'next/server'
import { encode } from 'next-auth/jwt'
import crypto from 'node:crypto'
import { getAppUserById } from '@/lib/user-store'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing ${name}`)
  }
  return value
}

function timingSafeEqualString(a: string, b: string) {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

/**
 * Agent-only login endpoint.
 *
 * Usage:
 *   /agent/login?userId=<id>&ts=<unix_ms>&sig=<hmac>
 *
 * Security:
 * - Only enabled when AGENT_MODE === "true"
 * - Requires HMAC signature using AGENT_LOGIN_SECRET
 * - Requires timestamp within a short window
 *
 * Result:
 * - Sets the NextAuth session-token cookie (JWT strategy)
 * - Redirects to /dashboard
 */
export async function GET(req: NextRequest) {
  if (process.env.AGENT_MODE !== 'true') {
    return new NextResponse('Not Found', { status: 404 })
  }

  const secret = requireEnv('NEXTAUTH_SECRET')

  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')?.trim() ?? ''
  const tsRaw = url.searchParams.get('ts')?.trim() ?? ''
  const sig = url.searchParams.get('sig')?.trim() ?? ''

  if (!userId) {
    return new NextResponse('Missing userId', { status: 400 })
  }

  const isLocalDev =
    process.env.NODE_ENV === 'development' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1')

  // Local-only bypass (unsigned):
  // If you’re running on localhost in development, allow /agent/login?userId=...
  // with no signature. This should NEVER be used for a deployed environment.
  const wantsSigned = tsRaw.length > 0 || sig.length > 0

  if (wantsSigned) {
    const agentSecret = requireEnv('AGENT_LOGIN_SECRET')

    if (!tsRaw || !sig) {
      return new NextResponse('Missing ts/sig', { status: 400 })
    }

    const ts = Number(tsRaw)
    if (!Number.isFinite(ts)) {
      return new NextResponse('Invalid ts', { status: 400 })
    }

    // 5 minute window to limit replay
    const now = Date.now()
    const MAX_SKEW_MS = 5 * 60 * 1000
    if (Math.abs(now - ts) > MAX_SKEW_MS) {
      return new NextResponse('Expired ts', { status: 401 })
    }

    const data = `${userId}.${ts}`
    const expectedSig = crypto
      .createHmac('sha256', agentSecret)
      .update(data)
      .digest('base64url')

    if (!timingSafeEqualString(sig, expectedSig)) {
      return new NextResponse('Invalid sig', { status: 401 })
    }
  } else if (!isLocalDev) {
    return new NextResponse('Signed login required', { status: 401 })
  }

  // Load user from Redis so the session has name/email/image.
  const user = await getAppUserById(userId)
  if (!user) {
    return new NextResponse('Unknown userId', { status: 404 })
  }

  const isSecure =
    url.protocol === 'https:' || process.env.NODE_ENV === 'production'

  // NextAuth cookie name for JWT strategy
  const cookieName = isSecure
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token'

  const maxAge = 30 * 24 * 60 * 60 // 30 days

  const token = await encode({
    token: {
      id: user.id,
      name: user.name,
      email: user.email,
      picture: user.image,
    },
    secret,
    maxAge,
    // NextAuth derives the encryption key using a salt; by default it uses
    // the cookie name, so we do the same to ensure getToken()/getServerSession()
    // can read the cookie without extra config.
    salt: cookieName,
  })

  const res = NextResponse.redirect(new URL('/dashboard', req.url))

  res.cookies.set(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure,
    path: '/',
    maxAge,
  })

  return res
}


