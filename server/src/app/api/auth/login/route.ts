import { signToken } from '@/lib/jwt'
import { upsertUser, getUserByEmail } from '@/lib/user-store'
import type { AppUser, LoginResponse, ApiResponse } from '@groupchat/shared'

/**
 * POST /api/auth/login
 *
 * Accepts an identity provider token (Apple or Google), verifies it,
 * creates or finds the user, and returns our own JWT.
 *
 * Body: { provider: 'apple' | 'google', identityToken: string }
 *
 * For development/testing, also accepts:
 * Body: { provider: 'dev', email: string, name: string }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { provider } = body

    let email: string
    let name: string
    let image = ''

    if (provider === 'apple') {
      // TODO: Verify Apple identity token using apple-signin-verify or jose
      // For now, trust the decoded claims from the client
      email = body.email
      name = body.name ?? ''
      // Apple doesn't provide profile images
    } else if (provider === 'google') {
      // TODO: Verify Google identity token via googleapis
      email = body.email
      name = body.name ?? ''
      image = body.image ?? ''
    } else if (provider === 'dev' && process.env.NODE_ENV === 'development') {
      // Dev-only: skip verification for testing
      email = body.email
      name = body.name ?? 'Dev User'
      image = `https://api.dicebear.com/7.x/avataaars/png?seed=${encodeURIComponent(email)}`
    } else {
      return Response.json(
        { ok: false, error: 'Unsupported auth provider' } satisfies ApiResponse<never>,
        { status: 400 },
      )
    }

    if (!email) {
      return Response.json(
        { ok: false, error: 'Email is required' } satisfies ApiResponse<never>,
        { status: 400 },
      )
    }

    // Find or create user
    let user = await getUserByEmail(email)

    if (!user) {
      const userId = crypto.randomUUID()
      user = await upsertUser({
        id: userId,
        name,
        email,
        image,
      })
    } else {
      // Update last active
      user = await upsertUser({
        ...user,
        name: name || user.name,
        image: image || user.image,
        lastActive: new Date().toISOString(),
        isOnline: true,
      })
    }

    // Issue JWT
    const token = await signToken({
      sub: user.id,
      email: user.email,
      name: user.name,
    })

    const response: ApiResponse<LoginResponse> = {
      ok: true,
      data: { token, user },
    }

    return Response.json(response)
  } catch (error) {
    console.error('[auth/login] Error:', error)
    return Response.json(
      { ok: false, error: 'Login failed' } satisfies ApiResponse<never>,
      { status: 500 },
    )
  }
}


