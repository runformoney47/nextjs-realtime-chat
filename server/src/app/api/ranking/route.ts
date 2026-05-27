import { authenticate } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import { fetchRedis } from '@/helpers/redis'
import { chatRankingSchema } from '@groupchat/shared'
import type { ChatRanking, ApiResponse } from '@groupchat/shared'

/**
 * POST /api/ranking
 *
 * Submit end-of-chat ranking ("who would you chat with again?").
 * This feeds the curation algorithm.
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
  const parsed = chatRankingSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: 'Invalid ranking data' } satisfies ApiResponse<never>,
      { status: 400 },
    )
  }

  const { chatId, ranking } = parsed.data

  // Verify membership
  const chatRaw = (await fetchRedis('get', `chat:${chatId}`)) as string | null
  if (!chatRaw) {
    return Response.json(
      { ok: false, error: 'Chat not found' } satisfies ApiResponse<never>,
      { status: 404 },
    )
  }

  const chat = JSON.parse(chatRaw)
  if (!chat.members?.includes(auth.sub)) {
    return Response.json(
      { ok: false, error: 'Not a member of this chat' } satisfies ApiResponse<never>,
      { status: 403 },
    )
  }

  const chatRanking: ChatRanking = {
    userId: auth.sub,
    chatId,
    ranking,
    submittedAt: Date.now(),
  }

  await Promise.all([
    // Store the ranking
    db.set(
      `ranking:${chatId}:${auth.sub}`,
      JSON.stringify(chatRanking),
    ),
    // Index for curation algorithm
    db.sadd(`ranking:index:${chatId}`, auth.sub),
    db.sadd(`ranking:index:user:${auth.sub}`, chatId),
  ])

  return Response.json({ ok: true, data: chatRanking } satisfies ApiResponse<ChatRanking>)
}


