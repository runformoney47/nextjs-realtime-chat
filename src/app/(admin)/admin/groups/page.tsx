import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import AdminGroupsClient from './AdminGroupsClient'

interface Group {
  id: string
  name: string
  description?: string
  memberCount: number
  createdAt: string
  lastMessage?: string
  isActive: boolean
}

async function getGroups(): Promise<Group[]> {
  try {
    // Get all groups
    const groupKeys = await db.keys('group:*')
    console.log('Group keys found:', groupKeys)
    const groups = []

    for (const key of groupKeys) {
      try {
        const groupData = await db.get(key)
        if (groupData) {
          let group
          if (typeof groupData === 'string') {
            group = JSON.parse(groupData)
          } else if (typeof groupData === 'object') {
            group = groupData
          } else {
            console.error(`Unexpected data type for group ${key}:`, typeof groupData)
            continue
          }
          console.log('Group data:', group)
          
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
            name: group.name || 'Unnamed Group',
            description: group.description,
            memberCount,
            createdAt: group.createdAt || group.created_at || new Date().toISOString(),
            lastMessage,
            isActive: group.isActive !== false // Default to true if not specified
          })
        }
      } catch (error) {
        console.error(`Error processing group ${key}:`, error)
      }
    }

    // Sort by creation date (newest first)
    groups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    console.log('Final groups array:', groups)
    return groups
  } catch (error) {
    console.error('Error fetching groups:', error)
    return []
  }
}

export default async function AdminGroups() {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    redirect('/login')
  }

  if (!session.user.isAdmin) {
    redirect('/dashboard')
  }

  const groups = await getGroups()

  return <AdminGroupsClient initialGroups={groups} />
}
