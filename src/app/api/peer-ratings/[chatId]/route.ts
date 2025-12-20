import { fetchRedis } from '@/helpers/redis'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { savePeerRatingsZScore } from '@/lib/surveys'
import { getServerSession } from 'next-auth'
import { z } from 'zod'

const ratingsArraySchema = z.array(
  z.object({
    targetUserId: z.string().min(1),
    rating: z.number().int().min(1).max(10),
  }),
)

function getPeerRatingsKey(chatId: string, userId: string) {
  return `chat:${chatId}:user:${userId}:peer-ratings-1to10`
}

export async function GET(
  req: Request,
  { params }: { params: { chatId: string } },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    const { chatId } = params

    if (!chatId.startsWith('group_')) {
      return new Response('This endpoint only works for group chats', {
        status: 400,
      })
    }

    // Verify membership
    const chatDataRaw = await fetchRedis('get', `chat:${chatId}`)
    if (!chatDataRaw) return new Response('Chat not found', { status: 404 })

    const chatData = JSON.parse(chatDataRaw as string) as GroupChat
    if (!chatData.members.includes(session.user.id)) {
      return new Response('You are not a member of this chat', { status: 403 })
    }

    const raw = await fetchRedis('get', getPeerRatingsKey(chatId, session.user.id))
    const parsed = raw ? JSON.parse(raw as string) : []

    return new Response(JSON.stringify({ ratings: parsed }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[PeerRatings][GET] Unexpected error', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}

export async function POST(
  req: Request,
  { params }: { params: { chatId: string } },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return new Response('Unauthorized', { status: 401 })

    const { chatId } = params

    if (!chatId.startsWith('group_')) {
      return new Response('This endpoint only works for group chats', {
        status: 400,
      })
    }

    // Parse ratings from query params (avoid body stream issues)
    const url = new URL(req.url)
    const ratingsParam = url.searchParams.get('ratings') ?? ''

    let ratings: { targetUserId: string; rating: number }[] = []
    try {
      const parsed: unknown = ratingsParam ? JSON.parse(ratingsParam) : []
      ratings = ratingsArraySchema.parse(parsed)
    } catch (error) {
      console.error('[PeerRatings][POST] Invalid ratings payload', error)
      return new Response('Invalid ratings payload', { status: 400 })
    }

    // Verify membership + validate target ids
    const chatDataRaw = await fetchRedis('get', `chat:${chatId}`)
    if (!chatDataRaw) return new Response('Chat not found', { status: 404 })

    const chatData = JSON.parse(chatDataRaw as string) as GroupChat
    const userId = session.user.id

    if (!chatData.members.includes(userId)) {
      return new Response('You are not a member of this chat', { status: 403 })
    }

    const memberSet = new Set(chatData.members)

    for (const r of ratings) {
      if (r.targetUserId === userId) {
        return new Response('You cannot rate yourself', { status: 400 })
      }
      if (!memberSet.has(r.targetUserId)) {
        return new Response('Invalid target user', { status: 400 })
      }
    }

    // Store latest raw ratings for quick UI reloads
    await db.set(getPeerRatingsKey(chatId, userId), JSON.stringify(ratings))

    // Best-effort: also store as a survey response (z-scored)
    try {
      await savePeerRatingsZScore({
        userId,
        chatId,
        studyId: null,
        sessionId: null,
        ratings,
        timepoint: 'in-session',
      })
    } catch (surveyError) {
      console.error('[PeerRatings][POST] Failed to save survey response', surveyError)
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[PeerRatings][POST] Unexpected error', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}


