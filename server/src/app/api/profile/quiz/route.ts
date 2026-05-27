import { authenticate } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import { fetchRedis } from '@/helpers/redis'
import { onboardingQuizSchema } from '@groupchat/shared'
import type { UserProfile, ApiResponse } from '@groupchat/shared'

/**
 * POST /api/profile/quiz
 *
 * Submit onboarding quiz answers. This creates/updates the user's profile
 * and makes them eligible for group chat curation.
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
  const parsed = onboardingQuizSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: 'Invalid quiz data', code: 'VALIDATION_ERROR' } satisfies ApiResponse<never>,
      { status: 400 },
    )
  }

  const profile: UserProfile = {
    userId: auth.sub,
    interests: parsed.data.interests,
    commStyle: parsed.data.commStyle,
    quizAnswers: parsed.data as Record<string, unknown>,
    completedAt: new Date().toISOString(),
  }

  await Promise.all([
    db.set(`user:${auth.sub}:profile`, JSON.stringify(profile)),
    // Add to curation pool (eligible for next group assignment)
    db.sadd('curation:pool:active', auth.sub),
  ])

  return Response.json({ ok: true, data: profile } satisfies ApiResponse<UserProfile>)
}

/**
 * GET /api/profile/quiz
 *
 * Get the current user's quiz/profile data.
 */
export async function GET(req: Request) {
  const auth = await authenticate(req)
  if (!auth) {
    return Response.json(
      { ok: false, error: 'Unauthorized' } satisfies ApiResponse<never>,
      { status: 401 },
    )
  }

  const raw = (await fetchRedis('get', `user:${auth.sub}:profile`)) as string | null
  if (!raw) {
    return Response.json(
      { ok: true, data: null } satisfies ApiResponse<UserProfile | null>,
    )
  }

  const profile = JSON.parse(raw) as UserProfile
  return Response.json({ ok: true, data: profile } satisfies ApiResponse<UserProfile>)
}


