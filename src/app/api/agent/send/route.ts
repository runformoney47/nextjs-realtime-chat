import { NextResponse } from 'next/server'
import { fetchRedis } from '@/helpers/redis'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import { Message, messageValidator } from '@/lib/validations/message'
import { nanoid } from 'nanoid'
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
 * POST /api/agent/send?userId=...&chatId=...&text=...&id=...
 * Agent-only message send for sim users (no NextAuth cookie needed).
 */
export async function POST(req: Request) {
  try {
    const gate = assertAgentAccess(req)
    if (!gate.ok) return gate.res

    const url = new URL(req.url)
    const userId = url.searchParams.get('userId') ?? ''
    const chatId = url.searchParams.get('chatId') ?? ''
    const text = url.searchParams.get('text') ?? ''
    const clientMessageId = url.searchParams.get('id') ?? ''

    if (!userId || !chatId || !text) {
      return NextResponse.json({ error: 'userId, chatId, text are required' }, { status: 400 })
    }

    const user = await getAppUserById(userId)
    if (!user) return NextResponse.json({ error: 'Unknown userId' }, { status: 404 })
    if (!user.isSimUser && !isSimUserEmail(user.email)) {
      return NextResponse.json({ error: 'Only sim users are allowed' }, { status: 403 })
    }

    if (!chatId.startsWith('group_')) {
      return NextResponse.json({ error: 'This endpoint only supports group chats' }, { status: 400 })
    }

    const chatData = (await fetchRedis('get', `chat:${chatId}`)) as string | null
    if (!chatData) return NextResponse.json({ error: 'Chat not found' }, { status: 404 })

    const groupChat = JSON.parse(chatData) as GroupChat
    if (!groupChat.members.includes(userId)) {
      return NextResponse.json({ error: 'User is not a member of this chat' }, { status: 403 })
    }

    const timestamp = Date.now()
    const messageData: Message = {
      id: clientMessageId || nanoid(),
      senderId: userId,
      text,
      timestamp,
    }

    const message = messageValidator.parse(messageData)
    const channelName = toPusherKey(`chat:${chatId}`)

    await db.zadd(`chat:${chatId}:messages`, {
      score: timestamp,
      member: JSON.stringify(message),
    })

    await pusherServer.trigger(channelName, 'incoming-message', message)

    return NextResponse.json({ ok: true, message }, { status: 200 })
  } catch (error) {
    console.error('[Agent][Send] Failed', error)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}




