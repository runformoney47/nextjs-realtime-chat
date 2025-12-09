import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin'
import { db } from '@/lib/db'
import { getAllAppUserIds } from '@/lib/user-store'
import { getAllGroupChatIds } from '@/lib/group-chats'

export async function GET() {
  try {
    // Check if user is admin
    const adminCheck = await isAdmin()
    if (!adminCheck) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Use canonical indexes instead of KEYS scans for better performance.
    const userIds = await getAllAppUserIds()
    const totalUsers = userIds.length

    const groupChatIds = await getAllGroupChatIds()
    const totalGroups = groupChatIds.length

    // Get active users (users who have been active in the last 24 hours)
    const now = Date.now()
    const twentyFourHoursMs = 24 * 60 * 60 * 1000

    const userJsons = await Promise.all(
      userIds.map((id) => db.get(`user:${id}`)),
    )

    let activeUsers = 0
    for (const raw of userJsons) {
      if (!raw) continue

      try {
        const userData = JSON.parse(raw as string) as { lastActive?: string }
        if (!userData.lastActive) continue

        const lastActiveTime = new Date(userData.lastActive).getTime()
        if (!Number.isNaN(lastActiveTime) && now - lastActiveTime <= twentyFourHoursMs) {
          activeUsers++
        }
      } catch {
        // Ignore malformed user records; they shouldn't break the stats endpoint.
        continue
      }
    }

    // Count messages sent today.
    // Messages are stored in sorted sets: chat:<chatId>:messages with score = timestamp.
    // For performance, we only count messages in known group chats here.
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const todayTimestamp = startOfToday.getTime()

    let messagesToday = 0
    for (const chatId of groupChatIds) {
      const key = `chat:${chatId}:messages`

      try {
        // Upstash does not support ZCOUNT via our thin fetchRedis wrapper yet,
        // so we fetch the messages for today by score and count them.
        const entries = await db.zrange(
          key,
          todayTimestamp,
          '+inf',
          { byScore: true },
        )

        if (Array.isArray(entries)) {
          messagesToday += entries.length
        }
      } catch (error) {
        console.error(`Error counting messages for chat ${chatId}:`, error)
      }
    }

    return NextResponse.json({
      totalUsers,
      totalGroups,
      activeUsers,
      messagesToday,
    })
  } catch (error) {
    console.error('Error fetching admin stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch admin stats' },
      { status: 500 },
    )
  }
}

