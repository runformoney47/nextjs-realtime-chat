import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchRedis } from '@/helpers/redis'
import { db } from '@/lib/db'
import { messageArrayValidator } from '@/lib/validations/message'
import type { AppUser } from '@/lib/user-store'

type GroupChatRecord = {
  id: string
  members: string[]
  createdAt?: number
  transitionDate?: number | null
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ chatId: string }> },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.isAdmin !== true) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { chatId } = await params
    if (!chatId || !chatId.startsWith('group_')) {
      return NextResponse.json({ error: 'Invalid chatId' }, { status: 400 })
    }

    const url = new URL(req.url)
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? '200') || 200, 1), 2000)

    const rawChat = (await fetchRedis('get', `chat:${chatId}`)) as string | null
    if (!rawChat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 })

    let chat: GroupChatRecord
    try {
      chat = JSON.parse(rawChat) as GroupChatRecord
    } catch {
      return NextResponse.json({ error: 'Malformed chat' }, { status: 500 })
    }

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

    const memberUsers = (
      await Promise.all(
        (chat.members ?? []).map(async (id) => {
          const raw = (await fetchRedis('get', `user:${id}`)) as string | null
          if (!raw) return null
          try {
            const u = JSON.parse(raw) as AppUser
            return { id: u.id, name: u.name, email: u.email, image: u.image, isSimUser: u.isSimUser }
          } catch {
            return null
          }
        }),
      )
    ).filter(Boolean)

    return NextResponse.json(
      {
        chat,
        members: memberUsers,
        messages,
        messageTotal: total,
        returned: messages.length,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('[Admin][GroupChats][GET chat] Failed', error)
    return NextResponse.json({ error: 'Failed to load chat' }, { status: 500 })
  }
}




