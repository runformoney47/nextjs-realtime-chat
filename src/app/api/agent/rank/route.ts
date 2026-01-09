import { NextResponse } from 'next/server'
import { fetchRedis } from '@/helpers/redis'
import { db } from '@/lib/db'
import { z } from 'zod'
import { getAppUserById } from '@/lib/user-store'
import { saveRankingTransition, saveTransitionRanking } from '@/lib/surveys'

function isSimUserEmail(email?: string) {
  return typeof email === 'string' && email.endsWith('@example.com')
}

function isLocalDevRequest(req: Request) {
  const url = new URL(req.url)
  return (
    process.env.NODE_ENV === 'development' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  )
}

function assertAgentAccess(req: Request) {
  if (process.env.AGENT_MODE !== 'true') {
    return { ok: false as const, res: NextResponse.json({ error: 'Not Found' }, { status: 404 }) }
  }

  const secret = process.env.AGENT_API_SECRET
  const provided = req.headers.get('x-agent-secret') ?? ''
  const isLocal = isLocalDevRequest(req)

  if (!isLocal || secret) {
    if (!secret) {
      return {
        ok: false as const,
        res: NextResponse.json({ error: 'Missing AGENT_API_SECRET' }, { status: 500 }),
      }
    }
    if (provided !== secret) {
      return { ok: false as const, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    }
  }

  return { ok: true as const }
}

const rankingsArraySchema = z.array(
  z.object({
    userId: z.string(),
    position: z.number(),
  }),
)

/**
 * POST /api/agent/rank?userId=...&chatId=...&rankings=<json>&type=<optional>
 * Agent-only rankings submit for sim users (no NextAuth cookie needed).
 */
export async function POST(req: Request) {
  try {
    const gate = assertAgentAccess(req)
    if (!gate.ok) return gate.res

    const url = new URL(req.url)
    const userId = url.searchParams.get('userId') ?? ''
    const chatId = url.searchParams.get('chatId') ?? ''
    const rankingsParam = url.searchParams.get('rankings') ?? ''
    const typeParam = (url.searchParams.get('type') ?? 'heuristic').trim()
    const rankingType = /^[a-zA-Z0-9_-]{1,40}$/.test(typeParam) ? typeParam : 'heuristic'

    if (!userId || !chatId) {
      return NextResponse.json({ error: 'userId and chatId are required' }, { status: 400 })
    }
    if (!chatId.startsWith('group_')) {
      return NextResponse.json({ error: 'This endpoint only supports group chats' }, { status: 400 })
    }

    const user = await getAppUserById(userId)
    if (!user) return NextResponse.json({ error: 'Unknown userId' }, { status: 404 })
    if (!user.isSimUser && !isSimUserEmail(user.email)) {
      return NextResponse.json({ error: 'Only sim users are allowed' }, { status: 403 })
    }

    let rankings: { userId: string; position: number }[] = []
    try {
      rankings = rankingsParam
        ? (JSON.parse(rankingsParam) as { userId: string; position: number }[])
        : []
      rankings = rankingsArraySchema.parse(rankings)
    } catch {
      return NextResponse.json({ error: 'Invalid rankings payload' }, { status: 400 })
    }

    const chatDataRaw = (await fetchRedis('get', `chat:${chatId}`)) as string | null
    if (!chatDataRaw) return NextResponse.json({ error: 'Chat not found' }, { status: 404 })

    const chatData = JSON.parse(chatDataRaw) as GroupChat
    if (!chatData.members.includes(userId)) {
      return NextResponse.json({ error: 'User is not a member of this chat' }, { status: 403 })
    }

    const rankingsKey =
      rankingType === 'heuristic'
        ? `chat:${chatId}:user:${userId}:rankings`
        : `chat:${chatId}:user:${userId}:rankings:${rankingType}`

    // Load previous rankings (same type)
    let beforeOrder: string[] = []
    try {
      const prevRaw = (await fetchRedis('get', rankingsKey)) as string | null
      if (prevRaw) {
        const prevArr = JSON.parse(prevRaw) as { userId: string; position: number }[]
        beforeOrder = prevArr
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((r) => r.userId)
      }
    } catch {
      beforeOrder = []
    }

    const afterOrder = rankings
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((r) => r.userId)

    await db.set(rankingsKey, JSON.stringify(rankings))

    // Back-compat: keep writing heuristic to the legacy key
    if (rankingType === 'heuristic' && rankingsKey !== `chat:${chatId}:user:${userId}:rankings`) {
      await db.set(`chat:${chatId}:user:${userId}:rankings`, JSON.stringify(rankings))
    }

    // Best-effort analytics trail
    try {
      await saveRankingTransition({
        userId,
        chatId,
        studyId: null,
        sessionId: rankingType === 'heuristic' ? null : `agent:${rankingType}`,
        before: beforeOrder,
        after: afterOrder,
      })
      await saveTransitionRanking({
        userId,
        chatId,
        studyId: null,
        sessionId: rankingType === 'heuristic' ? 'agent' : `agent:${rankingType}`,
        ranking: rankings,
        transitionTimestamp: Date.now(),
      })
    } catch (e) {
      console.warn('[Agent][Rank] Failed to save survey analytics', e)
    }

    return NextResponse.json({ ok: true, rankingType }, { status: 200 })
  } catch (error) {
    console.error('[Agent][Rank] Failed', error)
    return NextResponse.json({ error: 'Failed to save rankings' }, { status: 500 })
  }
}


