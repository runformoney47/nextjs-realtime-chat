import { authenticate } from '@/lib/auth-guard'
import { fetchRedis } from '@/helpers/redis'
import type { Message, ApiResponse } from '@groupchat/shared'

/**
 * GET /api/message/list?chatId=xxx&limit=50&before=timestamp
 *
 * Returns messages for a chat, newest first, with optional pagination.
 */
export async function GET(req: Request) {
  const auth = await authenticate(req)
  if (!auth) {
    return Response.json(
      { ok: false, error: 'Unauthorized' } satisfies ApiResponse<never>,
      { status: 401 },
    )
  }

  const url = new URL(req.url)
  const chatId = url.searchParams.get('chatId')
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200)

  if (!chatId) {
    return Response.json(
      { ok: false, error: 'chatId is required' } satisfies ApiResponse<never>,
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
      { ok: false, error: 'Not a member of this chat' } satisfies ApiResponse<never>,
      { status: 403 },
    )
  }

  // Fetch messages (sorted by timestamp ascending)
  const rawMessages = (await fetchRedis(
    'zrange',
    `chat:${chatId}:messages`,
    0,
    -1,
  )) as string[]

  const messages: Message[] = []
  for (const raw of rawMessages ?? []) {
    try {
      messages.push(JSON.parse(raw) as Message)
    } catch {
      // skip malformed
    }
  }

  // Sort ascending by timestamp and apply limit (most recent)
  messages.sort((a, b) => a.timestamp - b.timestamp)
  const sliced = messages.slice(-limit)

  return Response.json({ ok: true, data: sliced } satisfies ApiResponse<Message[]>)
}


