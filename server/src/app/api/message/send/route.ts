import { authenticate } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import { fetchRedis } from '@/helpers/redis'
import { pusherServer } from '@/lib/pusher'
import { sendMessageSchema, messageSchema } from '@groupchat/shared'
import { toPusherKey } from '@groupchat/shared'
import type { Message, ApiResponse } from '@groupchat/shared'
import { nanoid } from 'nanoid'

/**
 * POST /api/message/send
 *
 * Body: { chatId: string, text: string, clientId?: string }
 */
export async function POST(req: Request) {
  try {
    const auth = await authenticate(req)
    if (!auth) {
      return Response.json(
        { ok: false, error: 'Unauthorized' } satisfies ApiResponse<never>,
        { status: 401 },
      )
    }

    const body = await req.json()
    const parsed = sendMessageSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { ok: false, error: 'Invalid request', code: 'VALIDATION_ERROR' } satisfies ApiResponse<never>,
        { status: 400 },
      )
    }

    const { chatId, text, clientId } = parsed.data

    // Verify user is a member of this chat
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

    if (chat.active === false) {
      return Response.json(
        { ok: false, error: 'This chat has expired' } satisfies ApiResponse<never>,
        { status: 403 },
      )
    }

    const timestamp = Date.now()
    const message: Message = {
      id: clientId || nanoid(),
      senderId: auth.sub,
      text,
      timestamp,
    }

    // Validate
    messageSchema.parse(message)

    // Persist to Redis
    await db.zadd(`chat:${chatId}:messages`, {
      score: timestamp,
      member: JSON.stringify(message),
    })

    // Broadcast via Pusher
    const channelName = toPusherKey(`chat:${chatId}`)
    await pusherServer.trigger(channelName, 'incoming-message', message)

    // TODO: Trigger push notification for offline members

    return Response.json({ ok: true, data: message } satisfies ApiResponse<Message>)
  } catch (error) {
    console.error('[message/send] Error:', error)
    return Response.json(
      { ok: false, error: 'Failed to send message' } satisfies ApiResponse<never>,
      { status: 500 },
    )
  }
}


