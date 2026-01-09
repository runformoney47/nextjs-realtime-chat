import { NextResponse } from 'next/server'
import { fetchRedis } from '@/helpers/redis'
import { db } from '@/lib/db'
import { getAppUserById } from '@/lib/user-store'

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

type InterestOpinion = { interest_overlap: number }

function clamp01(x: number) {
  return Math.max(-1, Math.min(1, x))
}

/**
 * Accept either:
 * - number (interpreted as interest_overlap)
 * - object with interest_overlap
 * - legacy object with many dims (we only read interest_overlap)
 */
function normalizeInterest(raw: any): InterestOpinion | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return { interest_overlap: clamp01(raw) }
  }
  if (!raw || typeof raw !== 'object') return null
  const v = (raw as any).interest_overlap
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  return { interest_overlap: clamp01(v) }
}

function opinionKey(userId: string, otherId: string) {
  return `agent_opinion:user:${userId}:about:${otherId}`
}

/**
 * GET /api/agent/opinions?userId=...&chatId=...
 * Returns current stored opinions about other members in the chat.
 */
export async function GET(req: Request) {
  try {
    const gate = assertAgentAccess(req)
    if (!gate.ok) return gate.res

    const url = new URL(req.url)
    const userId = url.searchParams.get('userId') ?? ''
    const chatId = url.searchParams.get('chatId') ?? ''
    if (!userId || !chatId) {
      return NextResponse.json({ error: 'userId and chatId are required' }, { status: 400 })
    }
    if (!chatId.startsWith('group_')) {
      return NextResponse.json({ error: 'Only group chats supported' }, { status: 400 })
    }

    const user = await getAppUserById(userId)
    if (!user) return NextResponse.json({ error: 'Unknown userId' }, { status: 404 })
    if (!user.isSimUser && !isSimUserEmail(user.email)) {
      return NextResponse.json({ error: 'Only sim users are allowed' }, { status: 403 })
    }

    const chatDataRaw = (await fetchRedis('get', `chat:${chatId}`)) as string | null
    if (!chatDataRaw) return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
    const chatData = JSON.parse(chatDataRaw) as GroupChat
    if (!chatData.members.includes(userId)) {
      return NextResponse.json({ error: 'User is not a member of this chat' }, { status: 403 })
    }

    const others = chatData.members.filter((m) => m !== userId)
    const opinions: Record<string, InterestOpinion | null> = {}

    for (const otherId of others) {
      const raw = await db.get(opinionKey(userId, otherId))
      if (!raw) {
        opinions[otherId] = null
        continue
      }
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        opinions[otherId] = normalizeInterest(parsed)
      } catch {
        opinions[otherId] = null
      }
    }

    return NextResponse.json({ userId, chatId, opinions }, { status: 200 })
  } catch (error) {
    console.error('[Agent][Opinions][GET] Failed', error)
    return NextResponse.json({ error: 'Failed to load opinions' }, { status: 500 })
  }
}

/**
 * POST /api/agent/opinions?userId=...&chatId=...&dayIndex=...&opinions=<json>
 *
 * opinions JSON shape:
 * {
 *   "<otherId>": { warmth, respect, humor, trust, interest_overlap }
 * }
 */
export async function POST(req: Request) {
  try {
    const gate = assertAgentAccess(req)
    if (!gate.ok) return gate.res

    const url = new URL(req.url)
    const userId = url.searchParams.get('userId') ?? ''
    const chatId = url.searchParams.get('chatId') ?? ''
    const opinionsRaw = url.searchParams.get('opinions') ?? ''
    const dayIndexRaw = url.searchParams.get('dayIndex') ?? ''

    if (!userId || !chatId || !opinionsRaw) {
      return NextResponse.json({ error: 'userId, chatId, opinions are required' }, { status: 400 })
    }
    if (!chatId.startsWith('group_')) {
      return NextResponse.json({ error: 'Only group chats supported' }, { status: 400 })
    }

    const user = await getAppUserById(userId)
    if (!user) return NextResponse.json({ error: 'Unknown userId' }, { status: 404 })
    if (!user.isSimUser && !isSimUserEmail(user.email)) {
      return NextResponse.json({ error: 'Only sim users are allowed' }, { status: 403 })
    }

    const chatDataRaw = (await fetchRedis('get', `chat:${chatId}`)) as string | null
    if (!chatDataRaw) return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
    const chatData = JSON.parse(chatDataRaw) as GroupChat
    if (!chatData.members.includes(userId)) {
      return NextResponse.json({ error: 'User is not a member of this chat' }, { status: 403 })
    }

    let opinionsObj: any
    try {
      opinionsObj = JSON.parse(opinionsRaw)
    } catch {
      return NextResponse.json({ error: 'Invalid opinions JSON' }, { status: 400 })
    }
    if (!opinionsObj || typeof opinionsObj !== 'object') {
      return NextResponse.json({ error: 'opinions must be an object' }, { status: 400 })
    }

    const allowedOthers = new Set(chatData.members.filter((m) => m !== userId))
    const saved: Record<string, InterestOpinion> = {}

    for (const [otherId, rawVec] of Object.entries(opinionsObj)) {
      if (!allowedOthers.has(otherId)) continue
      const vec = normalizeInterest(rawVec)
      if (!vec) continue

      await db.set(
        opinionKey(userId, otherId),
        JSON.stringify({
          ...vec,
          updatedAt: Date.now(),
          dayIndex: dayIndexRaw || null,
          chatId,
        }),
      )
      saved[otherId] = vec
    }

    // Optional: store a per-day snapshot for analysis/export
    if (dayIndexRaw) {
      await db.set(
        `agent_opinion_snapshot:user:${userId}:chat:${chatId}:day:${dayIndexRaw}`,
        JSON.stringify({ userId, chatId, dayIndex: Number(dayIndexRaw), opinions: saved, savedAt: Date.now() }),
      )
    }

    return NextResponse.json({ ok: true, userId, chatId, savedCount: Object.keys(saved).length }, { status: 200 })
  } catch (error) {
    console.error('[Agent][Opinions][POST] Failed', error)
    return NextResponse.json({ error: 'Failed to save opinions' }, { status: 500 })
  }
}


