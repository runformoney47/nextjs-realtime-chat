import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin'
import { db } from '@/lib/db'

export async function GET() {
  try {
    // Check if user is admin
    const adminCheck = await isAdmin()
    if (!adminCheck) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Get all users
    const userKeys = await db.keys('user:*')
    const totalUsers = userKeys.length

    // Get all groups
    const groupKeys = await db.keys('group:*')
    const totalGroups = groupKeys.length

    // Get active users (users who have been active in the last 24 hours)
    const activeUserKeys = await db.keys('user:*')
    let activeUsers = 0
    for (const key of activeUserKeys) {
      const user = await db.get(key)
      if (user) {
        const userData = JSON.parse(user as string)
        if (userData.lastActive) {
          const lastActive = new Date(userData.lastActive)
          const now = new Date()
          const hoursDiff = (now.getTime() - lastActive.getTime()) / (1000 * 60 * 60)
          if (hoursDiff <= 24) {
            activeUsers++
          }
        }
      }
    }

    // Get messages from today (this is a simplified count)
    const messageKeys = await db.keys('message:*')
    const today = new Date().toDateString()
    let messagesToday = 0
    
    for (const key of messageKeys) {
      const message = await db.get(key)
      if (message) {
        const messageData = JSON.parse(message as string)
        if (messageData.timestamp) {
          const messageDate = new Date(messageData.timestamp).toDateString()
          if (messageDate === today) {
            messagesToday++
          }
        }
      }
    }

    return NextResponse.json({
      totalUsers,
      totalGroups,
      activeUsers,
      messagesToday
    })

  } catch (error) {
    console.error('Error fetching admin stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch admin stats' },
      { status: 500 }
    )
  }
}

