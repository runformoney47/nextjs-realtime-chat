import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAllAppUserIds } from '@/lib/user-store'
import { getAllGroupChatIds } from '@/lib/group-chats'
import { fetchRedis } from '@/helpers/redis'
import { db } from '@/lib/db'
import { getAllSurveyResponses } from '@/lib/surveys'

// type query param:
// - "users"       -> only users
// - "groupChats"  -> only groupChats
// - "messages"    -> only messages
// - "surveys"     -> only surveyResponses
// - undefined     -> full export
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!session.user.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const url = new URL(req.url)
    const type = url.searchParams.get('type') ?? 'all'
    const exportedAt = Date.now()

    // Users
    const userIds = await getAllAppUserIds()
    const users = []
    for (const id of userIds) {
      const raw = (await fetchRedis('get', `user:${id}`)) as string | null
      if (!raw) continue

      try {
        const parsed = JSON.parse(raw)
        users.push(parsed)
      } catch (error) {
        console.error('[Export] Failed to parse user', { id, error })
      }
    }

    // Group chats
    const groupChatIds = await getAllGroupChatIds()
    const groupChats = []
    for (const id of groupChatIds) {
      const raw = (await fetchRedis('get', `chat:${id}`)) as string | null
      if (!raw) continue

      try {
        const parsed = JSON.parse(raw)
        groupChats.push(parsed)
      } catch (error) {
        console.error('[Export] Failed to parse group chat', { id, error })
      }
    }

    // Messages (group + direct) – gather from all zsets chat:*:messages
    const messageKeys = (await fetchRedis('keys', 'chat:*:messages')) as string[]
    const messages: { chatKey: string; chatId: string; messages: unknown[] }[] = []

    for (const key of messageKeys) {
      try {
        const parts = key.split(':')
        // key format: chat:<chatId>:messages
        const chatId = parts.length >= 3 ? parts.slice(1, -1).join(':') : ''

        const rawMessages = (await fetchRedis('zrange', key, 0, -1)) as string[]
        const parsedMessages = rawMessages.map((m) => {
          try {
            return JSON.parse(m)
          } catch {
            return m
          }
        })

        messages.push({
          chatKey: key,
          chatId,
          messages: parsedMessages,
        })
      } catch (error) {
        console.error('[Export] Failed to load messages for key', key, error)
      }
    }

    // Survey responses
    const surveyResponses = await getAllSurveyResponses()
    const rankingTransitions = surveyResponses.filter(
      (r) => r.surveyId === 'ranking-transition',
    )
    const transitionRankings = surveyResponses.filter(
      (r) => r.surveyId === 'transition-ranking',
    )
    const otherSurveyResponses = surveyResponses.filter(
      (r) => r.surveyId !== 'ranking-transition' && r.surveyId !== 'transition-ranking',
    )

    let payload: unknown
    let filenameBase: string

    switch (type) {
      case 'users':
        payload = { exportedAt, users }
        filenameBase = 'export-users'
        break
      case 'groupChats':
        payload = { exportedAt, groupChats }
        filenameBase = 'export-group-chats'
        break
      case 'messages':
        payload = { exportedAt, messages }
        filenameBase = 'export-messages'
        break
      case 'surveys':
        payload = {
          exportedAt,
          rankingTransitions,
          transitionRankings,
          otherSurveyResponses,
        }
        filenameBase = 'export-surveys'
        break
      case 'rankingTransitions':
        payload = { exportedAt, rankingTransitions }
        filenameBase = 'export-ranking-transitions'
        break
      case 'transitionRankings':
        payload = { exportedAt, transitionRankings }
        filenameBase = 'export-transition-rankings'
        break
      default:
        payload = {
          exportedAt,
          users,
          groupChats,
          messages,
          surveyResponses,
          rankingTransitions,
          transitionRankings,
          otherSurveyResponses,
        }
        filenameBase = 'export-all'
        break
    }

    return new NextResponse(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filenameBase}-${exportedAt}.json"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[Export] Failed to build export payload', error)
    return NextResponse.json(
      { error: 'Failed to export data' },
      { status: 500 },
    )
  }
}


