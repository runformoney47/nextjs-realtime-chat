import { NextResponse } from 'next/server'
import { fetchRedis } from '@/helpers/redis'
import { db } from '@/lib/db'
import { messageArrayValidator } from '@/lib/validations/message'
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

/**
 * GET /api/agent/messages?userId=...&chatId=...&limit=...
 * Agent-only message listing for sim users (no NextAuth cookie needed).
 */
export async function GET(req: Request) {
  try {
    const gate = assertAgentAccess(req)
    if (!gate.ok) return gate.res

    const url = new URL(req.url)
    const userId = url.searchParams.get('userId') ?? ''
    const chatId = url.searchParams.get('chatId') ?? ''
    const limitRaw = url.searchParams.get('limit') ?? '100'

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

    const chatDataRaw = (await fetchRedis('get', `chat:${chatId}`)) as string | null
    if (!chatDataRaw) return NextResponse.json({ error: 'Chat not found' }, { status: 404 })

    const chatData = JSON.parse(chatDataRaw) as GroupChat
    if (!chatData.members.includes(userId)) {
      return NextResponse.json({ error: 'User is not a member of this chat' }, { status: 403 })
    }

    const limit = Math.min(Math.max(Number(limitRaw) || 100, 1), 2000)
    const total = (await db.zcard(`chat:${chatId}:messages`)) as number
    const start = Math.max(0, total - limit)

    const rawMessages = (await fetchRedis(
      'zrange',
      `chat:${chatId}:messages`,
      start,
      -1,
    )) as string[] | null

    const parsed =
      rawMessages?.map((m) => {
        try {
          return JSON.parse(m)
        } catch {
          return null
        }
      }) ?? []

    const messages = messageArrayValidator.parse(parsed.filter(Boolean))

    return NextResponse.json(
      {
        chatId,
        userId,
        total,
        returned: messages.length,
        messages,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('[Agent][Messages] Failed', error)
    return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
  }
}


