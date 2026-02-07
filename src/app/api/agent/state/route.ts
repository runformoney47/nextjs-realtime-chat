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

  // In local dev: allow no secret if AGENT_API_SECRET is unset.
  // Otherwise (or if secret is set), require a match.
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

export async function GET(req: Request) {
  try {
    const gate = assertAgentAccess(req)
    if (!gate.ok) return gate.res

    const url = new URL(req.url)
    const userId = url.searchParams.get('userId') ?? ''
    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })

    const user = await getAppUserById(userId)
    if (!user) return NextResponse.json({ error: 'Unknown userId' }, { status: 404 })
    if (!user.isSimUser && !isSimUserEmail(user.email)) {
      return NextResponse.json({ error: 'Only sim users are allowed' }, { status: 403 })
    }

    const chatId = (await db.get(`user:${userId}:current_group_chat`)) as string | null
    if (!chatId) {
      return NextResponse.json({ userId, chatId: null }, { status: 200 })
    }

    const rawChat = (await fetchRedis('get', `chat:${chatId}`)) as string | null
    const chat = rawChat ? (() => { try { return JSON.parse(rawChat) } catch { return null } })() : null

    const messageCount = (await db.zcard(`chat:${chatId}:messages`)) as number
    const lastMsgRaw = (await fetchRedis('zrange', `chat:${chatId}:messages`, -1, -1)) as
      | string[]
      | null
    let lastMessage: any = null
    if (lastMsgRaw && lastMsgRaw.length) {
      try {
        lastMessage = JSON.parse(lastMsgRaw[0])
      } catch {
        lastMessage = null
      }
    }

    return NextResponse.json(
      {
        userId,
        chatId,
        chat,
        messageCount,
        lastMessage,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('[Agent][State] Failed', error)
    return NextResponse.json({ error: 'Failed to load state' }, { status: 500 })
  }
}




