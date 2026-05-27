import { authenticate } from '@/lib/auth-guard'
import { fetchRedis } from '@/helpers/redis'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@groupchat/shared'
import type { ApiResponse } from '@groupchat/shared'

/**
 * POST /api/message/typing
 *
 * Broadcast a typing indicator to a chat channel.
 * Body: { chatId: string, status: 'start' | 'stop' }
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
    const { chatId, status } = body

    if (!chatId || !['start', 'stop'].includes(status)) {
      return Response.json(
        { ok: false, error: 'chatId and status (start|stop) required' } satisfies ApiResponse<never>,
        { status: 400 },
      )
    }

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
        { ok: false, error: 'Not a member' } satisfies ApiResponse<never>,
        { status: 403 },
      )
    }

    // Get the user's color from the chat
    const color = chat.memberColors?.[auth.sub] ?? null

    // Broadcast typing event
    const channelName = toPusherKey(`chat:${chatId}`)
    await pusherServer.trigger(channelName, 'typing', {
      userId: auth.sub,
      color,
      status,
      timestamp: Date.now(),
    })

    return Response.json({ ok: true, data: { sent: true } } satisfies ApiResponse<{ sent: boolean }>)
  } catch (error) {
    console.error('[message/typing] Error:', error)
    return Response.json(
      { ok: false, error: 'Typing broadcast failed' } satisfies ApiResponse<never>,
      { status: 500 },
    )
  }
}


