import { authenticate } from '@/lib/auth-guard'
import { fetchRedis } from '@/helpers/redis'
import type { GroupChat, ApiResponse } from '@groupchat/shared'

/**
 * GET /api/chat/current
 *
 * Returns the user's one active group chat, or null if they don't have one.
 */
export async function GET(req: Request) {
  const auth = await authenticate(req)
  if (!auth) {
    return Response.json(
      { ok: false, error: 'Unauthorized' } satisfies ApiResponse<never>,
      { status: 401 },
    )
  }

  // Look up the user's current chat assignment
  const chatId = (await fetchRedis('get', `user:${auth.sub}:current_chat`)) as string | null

  if (!chatId) {
    return Response.json({ ok: true, data: null } satisfies ApiResponse<GroupChat | null>)
  }

  const chatRaw = (await fetchRedis('get', `chat:${chatId}`)) as string | null
  if (!chatRaw) {
    return Response.json({ ok: true, data: null } satisfies ApiResponse<GroupChat | null>)
  }

  try {
    const chat = JSON.parse(chatRaw) as GroupChat
    return Response.json({ ok: true, data: chat } satisfies ApiResponse<GroupChat>)
  } catch {
    return Response.json({ ok: true, data: null } satisfies ApiResponse<GroupChat | null>)
  }
}


