import { authenticate } from '@/lib/auth-guard'
import { fetchRedis } from '@/helpers/redis'
import type { GroupChat, ApiResponse } from '@groupchat/shared'

/**
 * GET /api/chat/:id
 *
 * Returns full group chat metadata for a chat the caller belongs to.
 * Used by history detail (`chat/[id]`) and to refresh lifecycle state.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await authenticate(req)
  if (!auth) {
    return Response.json(
      { ok: false, error: 'Unauthorized' } satisfies ApiResponse<never>,
      { status: 401 },
    )
  }

  const chatId = params.id
  if (!chatId) {
    return Response.json(
      { ok: false, error: 'Chat id is required' } satisfies ApiResponse<never>,
      { status: 400 },
    )
  }

  const raw = (await fetchRedis('get', `chat:${chatId}`)) as string | null
  if (!raw) {
    return Response.json(
      { ok: false, error: 'Chat not found' } satisfies ApiResponse<never>,
      { status: 404 },
    )
  }

  let chat: GroupChat
  try {
    chat = JSON.parse(raw) as GroupChat
  } catch {
    return Response.json(
      { ok: false, error: 'Invalid chat data' } satisfies ApiResponse<never>,
      { status: 500 },
    )
  }

  if (!chat.members?.includes(auth.sub)) {
    return Response.json(
      { ok: false, error: 'Not a member of this chat' } satisfies ApiResponse<never>,
      { status: 403 },
    )
  }

  return Response.json({ ok: true, data: chat } satisfies ApiResponse<GroupChat>)
}
