import { authenticate } from '@/lib/auth-guard'
import { fetchRedis } from '@/helpers/redis'
import type { GroupChat, ApiResponse } from '@groupchat/shared'

/**
 * GET /api/chat/list
 *
 * Returns all group chats the user is currently a member of (active + past).
 * Query params:
 *   ?active=true  — only active chats
 *   ?active=false — only past (expired) chats
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
  const activeFilter = url.searchParams.get('active')

  // Get all chat IDs the user has been in
  const chatIds = ((await fetchRedis(
    'smembers',
    `user:${auth.sub}:group_chats`,
  )) as string[] | null) ?? []

  if (!chatIds.length) {
    return Response.json({ ok: true, data: [] } satisfies ApiResponse<GroupChat[]>)
  }

  const chats: GroupChat[] = []
  const now = Date.now()

  for (const chatId of chatIds) {
    const raw = (await fetchRedis('get', `chat:${chatId}`)) as string | null
    if (!raw) continue
    try {
      const chat = JSON.parse(raw) as GroupChat
      // Apply active filter
      if (activeFilter === 'true' && !chat.active) continue
      if (activeFilter === 'false' && chat.active) continue
      chats.push(chat)
    } catch {
      // skip malformed
    }
  }

  // Sort: active first, then by creation date descending
  chats.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    return b.createdAt - a.createdAt
  })

  return Response.json({ ok: true, data: chats } satisfies ApiResponse<GroupChat[]>)
}


