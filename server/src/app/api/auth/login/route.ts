import { signToken } from '@/lib/jwt'
import {
  upsertUser,
  getUserByEmail,
  getUserByAppleSub,
  linkAppleSub,
} from '@/lib/user-store'
import { verifyAppleIdentityToken } from '@/lib/apple-auth'
import type { AppUser, LoginResponse, ApiResponse } from '@groupchat/shared'

type AppleFullName = {
  givenName?: string | null
  familyName?: string | null
}

function formatAppleName(fullName?: AppleFullName | null): string {
  if (!fullName) return ''
  return [fullName.givenName, fullName.familyName].filter(Boolean).join(' ').trim()
}

/**
 * POST /api/auth/login
 *
 * Body (Apple): { provider: 'apple', identityToken: string, fullName?: {...}, email?: string }
 * Body (dev):    { provider: 'dev', email: string, name: string }  — development only
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { provider } = body

    let email: string
    let name: string
    let image = ''
    let appleSub: string | null = null

    if (provider === 'apple') {
      const identityToken = body.identityToken as string | undefined
      if (!identityToken) {
        return Response.json(
          { ok: false, error: 'identityToken is required' } satisfies ApiResponse<never>,
          { status: 400 },
        )
      }

      const claims = await verifyAppleIdentityToken(identityToken)
      if (!claims) {
        return Response.json(
          { ok: false, error: 'Invalid Apple identity token' } satisfies ApiResponse<never>,
          { status: 401 },
        )
      }

      appleSub = claims.sub
      // Prefer verified email from token; client email only as fallback (first sign-in)
      email = claims.email ?? body.email ?? ''
      name = formatAppleName(body.fullName) || (body.name ?? '')
    } else if (provider === 'dev' && process.env.NODE_ENV === 'development') {
      email = body.email
      name = body.name ?? 'Dev User'
      image = `https://api.dicebear.com/7.x/avataaars/png?seed=${encodeURIComponent(email)}`
    } else {
      return Response.json(
        { ok: false, error: 'Unsupported auth provider' } satisfies ApiResponse<never>,
        { status: 400 },
      )
    }

    // ─── Find or create user ───────────────────────────────────────────
    let user: AppUser | null = null

    if (appleSub) {
      user = await getUserByAppleSub(appleSub)
    }

    if (!user && email) {
      user = await getUserByEmail(email)
    }

    if (!user) {
      if (!email && appleSub) {
        return Response.json(
          {
            ok: false,
            error: 'Apple account not linked. Sign in again with email visible, or contact support.',
            code: 'APPLE_EMAIL_REQUIRED',
          } satisfies ApiResponse<never>,
          { status: 400 },
        )
      }

      if (!email) {
        return Response.json(
          { ok: false, error: 'Email is required' } satisfies ApiResponse<never>,
          { status: 400 },
        )
      }

      const userId = crypto.randomUUID()
      user = await upsertUser({
        id: userId,
        name: name || email.split('@')[0],
        email,
        image,
      })
    } else {
      user = await upsertUser({
        ...user,
        name: name || user.name,
        email: email || user.email,
        image: image || user.image,
        lastActive: new Date().toISOString(),
        isOnline: true,
      })
    }

    if (appleSub) {
      await linkAppleSub(user.id, appleSub)
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
    console.error('[auth/login] Error:', error)
    return Response.json(
      { ok: false, error: 'Login failed' } satisfies ApiResponse<never>,
      { status: 500 },
    )
  }
}
