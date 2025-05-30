import { fetchRedis } from '@/helpers/redis'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { nanoid } from 'nanoid'
import { getServerSession } from 'next-auth'
import { pusherServer } from '@/lib/pusher'

// The list of colors for anonymous identities
const COLORS = ['Green', 'Yellow', 'Orange', 'Red', 'Violet']

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return new Response('Unauthorized', { status: 401 })
    }

    console.log('Starting group chat rebuild...')

    // Notify all connected clients that group chats are being rebuilt
    await pusherServer.trigger('global_notifications', 'group_chat_update', {
      eventType: 'rebuild',
      timestamp: Date.now(),
      message: 'Group chats are being rebuilt'
    })

    // Step 1: Get all users
    const rawUsers = await fetchRedis('keys', 'user:*') as string[]
    const userIds = rawUsers
      .filter(key => !key.includes(':') || key.split(':').length === 2) // Only get direct user keys
      .map(key => key.split(':')[1]) // Extract user IDs
    
    console.log(`Found ${userIds.length} users: ${userIds.join(', ')}`)

    // Archive existing group chats instead of deleting them
    // Get all existing group chats
    const existingGroupChatKeys = await fetchRedis('keys', 'chat:group_*') as string[]
    const existingGroupChats = []
    
    for (const key of existingGroupChatKeys) {
      const chatId = key.split(':')[1] // Extract chat ID from key
      
      // Skip group chat color keys and other related keys
      if (chatId.includes(':')) continue
      
      try {
        const chatData = await fetchRedis('get', key) as string
        existingGroupChats.push({
          id: chatId,
          data: JSON.parse(chatData)
        })
      } catch (error) {
        console.error(`Error retrieving chat data for ${key}:`, error)
      }
    }
    
    console.log(`Found ${existingGroupChats.length} existing group chats to archive`)
    
    // Archive existing group chats by keeping them but renaming/marking as archived
    const timestamp = Date.now()
    for (const chat of existingGroupChats) {
      const data = chat.data
      data.archived = true
      data.archivedAt = timestamp
      
      // Update the record with archived flag
      await db.set(`chat:${chat.id}`, JSON.stringify(data))
      
      // Also create an archive record for future reference
      await db.set(`archive:chat:${chat.id}`, JSON.stringify(data))
    }
    
    // Get current user's group chat before clearing user mappings
    let currentUserPreviousChat = null
    try {
      currentUserPreviousChat = await fetchRedis('get', `user:${session.user.id}:current_group_chat`)
      console.log(`Current user's previous chat: ${currentUserPreviousChat}`)
    } catch (error) {
      console.log('No previous chat found for current user')
    }

    // Clear the available group chats set
    await db.del('available_group_chats')
    
    // Clear user's current group chat settings
    for (const userId of userIds) {
      await db.del(`user:${userId}:current_group_chat`)
      
      // Also clear their group_chats set (active chats)
      await db.del(`user:${userId}:group_chats`)
    }

    // Step 3: Create new group chats
    const groupChats = []
    let currentUserChatId = null
    
    // In a future version, this is where we would use the Python algorithm's results
    // For now, we'll continue with the simple approach of splitting users into groups of 5
    
    // Shuffle the user IDs to create new random groups
    const shuffledUserIds = [...userIds].sort(() => Math.random() - 0.5)
    
    // Split users into groups of 5
    for (let i = 0; i < shuffledUserIds.length; i += 5) {
      const groupMembers = shuffledUserIds.slice(i, i + 5)
      const groupChatId = 'group_' + nanoid()
      
      const groupChat = {
        id: groupChatId,
        name: 'Anonymous Group Chat',
        creatorId: session.user.id,
        members: groupMembers,
        createdAt: Date.now()
      }
      
      // Save group chat to Redis
      await db.set(`chat:${groupChatId}`, JSON.stringify(groupChat))
      
      // Mark this chat as available if it has fewer than 5 members
      if (groupMembers.length < 5) {
        await db.sadd('available_group_chats', groupChatId)
      }
      
      // Assign colors to each member
      const colorAssignments = []
      for (let j = 0; j < groupMembers.length; j++) {
        const memberId = groupMembers[j]
        const color = COLORS[j]
        
        // Store the color in Redis
        await db.set(`chat:${groupChatId}:user:${memberId}:color`, color)
        
        // Add this chat to the user's group chats
        await db.sadd(`user:${memberId}:group_chats`, groupChatId)
        
        // Set as user's current group chat
        await db.set(`user:${memberId}:current_group_chat`, groupChatId)
        
        // Track the current user's new chat ID
        if (memberId === session.user.id) {
          currentUserChatId = groupChatId
          console.log(`Set current user's new chat to: ${currentUserChatId}`)
        }
        
        colorAssignments.push({
          userId: memberId,
          color
        })
      }
      
      groupChats.push({
        chatId: groupChatId,
        members: groupMembers,
        colorAssignments
      })
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Created ${groupChats.length} group chats`,
      groupChats,
      currentUserChatId, // Return the current user's new chat ID
      previousChatId: currentUserPreviousChat // Return the previous chat ID for reference
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    })
  } catch (error) {
    console.error('Error rebuilding group chats:', error)
    return new Response('Server error', { status: 500 })
  }
} 