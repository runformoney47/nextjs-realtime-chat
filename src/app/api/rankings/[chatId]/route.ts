import { fetchRedis } from '@/helpers/redis'
import { authOptions } from '@/lib/auth'
import { getServerSession } from 'next-auth'
import { db } from '@/lib/db'
import { saveRankingTransition, saveTransitionRanking } from '@/lib/surveys'
import { z } from 'zod'

export async function GET(
  req: Request,
  { params }: { params: { chatId: string } },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return new Response('Unauthorized', { status: 401 })
    }

    const { chatId } = params

    // Check if this is a group chat
    if (!chatId.startsWith('group_')) {
      return new Response('This endpoint only works for group chats', { status: 400 })
    }

    // Verify the user is a member of this chat
    const chatDataRaw = await fetchRedis('get', `chat:${chatId}`)
    if (!chatDataRaw) {
      return new Response('Chat not found', { status: 404 })
    }

    const chatData = JSON.parse(chatDataRaw as string) as GroupChat
    if (!chatData.members.includes(session.user.id)) {
      return new Response('You are not a member of this chat', { status: 403 })
    }

    // Get the user's rankings from Redis
    const rankingsKey = `chat:${chatId}:user:${session.user.id}:rankings`

    // Try to get the stored rankings
    let rankings
    try {
      rankings = await fetchRedis('get', rankingsKey)
    } catch (error) {
      console.log('No rankings found, returning empty array')
      rankings = null
    }

    const parsedRankings = rankings ? JSON.parse(rankings as string) : []

    return new Response(
      JSON.stringify({
        rankings: parsedRankings,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    )
  } catch (error) {
    console.error('Error retrieving rankings:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}

// Simple schema for validating rankings payload
const rankingsArraySchema = z.array(
  z.object({
    userId: z.string(),
    position: z.number(),
  }),
)

export async function POST(
  req: Request,
  { params }: { params: { chatId: string } },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return new Response('Unauthorized', { status: 401 })
    }

    const { chatId } = params

    if (!chatId.startsWith('group_')) {
      return new Response('This endpoint only works for group chats', { status: 400 })
    }

    // Parse rankings from query param to avoid body stream issues.
    const url = new URL(req.url)
    const rankingsParam = url.searchParams.get('rankings') ?? ''

    let rankings: { userId: string; position: number }[] = []
    try {
      rankings = rankingsParam
        ? (JSON.parse(rankingsParam) as { userId: string; position: number }[])
        : []
      rankings = rankingsArraySchema.parse(rankings)
      console.log('[Rankings][POST] Parsed rankings payload', {
        chatId,
        rankingsCount: rankings.length,
        userId: session.user.id,
      })
    } catch (error) {
      console.error('[Rankings][POST] Failed to parse rankings param', error)
      return new Response('Invalid rankings payload', { status: 400 })
    }

    // Verify the user is a member of this chat
    const chatDataRaw = await fetchRedis('get', `chat:${chatId}`)
    if (!chatDataRaw) {
      return new Response('Chat not found', { status: 404 })
    }

    const chatData = JSON.parse(chatDataRaw as string) as GroupChat
    if (!chatData.members.includes(session.user.id)) {
      return new Response('You are not a member of this chat', { status: 403 })
    }

    // Load previous rankings (if any) to record transition
    let beforeOrder: string[] = []
    try {
      const prevRaw = (await fetchRedis(
        'get',
        `chat:${chatId}:user:${session.user.id}:rankings`,
      )) as string | null
      if (prevRaw) {
        const prevArr = JSON.parse(prevRaw) as { userId: string; position: number }[]
        // Sort by position to get the effective ordering
        beforeOrder = prevArr
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((r) => r.userId)
      }
    } catch (error) {
      console.warn('[Rankings][POST] Failed to load previous rankings', error)
    }

    const afterOrder = rankings
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((r) => r.userId)

    // Save the user's rankings in Redis for fast in-app access
    const rankingsKey = `chat:${chatId}:user:${session.user.id}:rankings`
    await db.set(rankingsKey, JSON.stringify(rankings))

    // Best-effort: also record as ranking transition + snapshot
    try {
      await saveRankingTransition({
        userId: session.user.id,
        chatId,
        studyId: null,
        sessionId: null,
        before: beforeOrder,
        after: afterOrder,
      })

      await saveTransitionRanking({
        userId: session.user.id,
        chatId,
        studyId: null,
        sessionId: 'ad-hoc', // can be refined to real session/transition id later
        ranking: rankings,
        transitionTimestamp: Date.now(),
      })
    } catch (surveyError) {
      console.error('[Rankings][POST] Failed to save survey response', surveyError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Rankings saved successfully',
      }),
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    )
  } catch (error) {
    console.error('[Rankings][POST] Unexpected error', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}
