import { expireChatById } from '@/lib/chat-store'
import type { GroupChat, ApiResponse } from '@groupchat/shared'

/**
 * POST /api/dev/expire-chat
 *
 * DEV ONLY. Marks a group chat as ended (`active: false`) for lifecycle testing.
 * Does not delete messages; members can still read history.
 *
 * Body: { chatId: string }
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return Response.json(
      { ok: false, error: 'Dev-only endpoint' } satisfies ApiResponse<never>,
      { status: 403 },
    )
  }

  try {
    const body = await req.json()
    const { chatId } = body as { chatId?: string }

    if (!chatId) {
      return Response.json(
        { ok: false, error: 'chatId is required' } satisfies ApiResponse<never>,
        { status: 400 },
      )
    }

    const updated = await expireChatById(chatId)
    if (!updated) {
      return Response.json(
        { ok: false, error: 'Chat not found' } satisfies ApiResponse<never>,
        { status: 404 },
      )
    }

    return Response.json({
      ok: true,
      data: { chat: updated },
    } satisfies ApiResponse<{ chat: GroupChat }>)
  } catch (error) {
    console.error('[dev/expire-chat] Error:', error)
    return Response.json(
      { ok: false, error: 'Failed to expire chat' } satisfies ApiResponse<never>,
      { status: 500 },
    )
  }
}
