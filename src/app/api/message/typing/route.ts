import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchRedis } from '@/helpers/redis'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const chatId = url.searchParams.get('chatId') ?? ''
    const status = (url.searchParams.get('status') ?? '') as 'start' | 'stop'

    if (!chatId || (status !== 'start' && status !== 'stop')) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
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

    const payload = {
      userId: session.user.id,
      status,
      timestamp: Date.now(),
    }

    await pusherServer.trigger(toPusherKey(`chat:${chatId}`), 'typing', payload)

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('[Typing][POST] Failed to send typing event', error)
    return NextResponse.json({ error: 'Failed to send typing event' }, { status: 500 })
  }
}





