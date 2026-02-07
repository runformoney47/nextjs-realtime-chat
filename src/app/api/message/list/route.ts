import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchRedis } from '@/helpers/redis'
import { messageArrayValidator } from '@/lib/validations/message'

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const chatId = url.searchParams.get('chatId') ?? ''

    if (!chatId) {
      return NextResponse.json({ error: 'chatId is required' }, { status: 400 })
    }

    const isGroupChat = chatId.startsWith('group_')

    if (isGroupChat) {
      const chatDataRaw = await fetchRedis('get', `chat:${chatId}`)
      if (!chatDataRaw) {
        return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
      }

      const chatData = JSON.parse(chatDataRaw as string) as GroupChat
      if (!chatData.members.includes(session.user.id)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else {
      const [userId1, userId2] = chatId.split('--')
      if (session.user.id !== userId1 && session.user.id !== userId2) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const rawMessages = (await fetchRedis(
      'zrange',
      `chat:${chatId}:messages`,
      0,
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

    return NextResponse.json({ messages }, { status: 200 })
  } catch (error) {
    console.error('[Messages][GET] Failed to list messages', error)
    return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
  }
}





