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

    // Get all groups
    const groupKeys = await db.keys('group:*')
    const groups = []

    for (const key of groupKeys) {
      const groupData = await db.get(key)
      if (groupData) {
        const group = JSON.parse(groupData as string)
        
        // Get member count
        const memberKeys = await db.keys(`group:${group.id}:members:*`)
        const memberCount = memberKeys.length

        // Get last message
        const messageKeys = await db.keys(`message:${group.id}:*`)
        let lastMessage = null
        if (messageKeys.length > 0) {
          // Sort by timestamp to get the latest
          const sortedMessages = messageKeys.sort()
          const lastMessageKey = sortedMessages[sortedMessages.length - 1]
          const lastMessageData = await db.get(lastMessageKey)
          if (lastMessageData) {
            const message = JSON.parse(lastMessageData as string)
            lastMessage = message.timestamp
          }
        }

        groups.push({
          id: group.id,
          name: group.name,
          description: group.description,
          memberCount,
          createdAt: group.createdAt || new Date().toISOString(),
          lastMessage,
          isActive: group.isActive !== false // Default to true if not specified
        })
      }
    }

    // Sort by creation date (newest first)
    groups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return NextResponse.json(groups)

  } catch (error) {
    console.error('Error fetching groups:', error)
    return NextResponse.json(
      { error: 'Failed to fetch groups' },
      { status: 500 }
    )
  }
}

