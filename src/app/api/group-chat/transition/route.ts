import { fetchRedis } from '@/helpers/redis'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { nanoid } from 'nanoid'
import { getServerSession } from 'next-auth'
import { pusherServer } from '@/lib/pusher'
import { getAllAppUserIds } from '@/lib/user-store'
import { addGroupChatId, getAllGroupChatIds, buildRandomGroups } from '@/lib/group-chats'

// The list of colors for anonymous identities
const COLORS = ['Green', 'Yellow', 'Orange', 'Red', 'Violet']

// This endpoint will be the one to integrate with an external algorithm
// for creating optimal group chat assignments
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return new Response('Unauthorized', { status: 401 })
    }

    // Only allow admins to trigger transitions
    // In a real app, you would check if the user has admin privileges
    const isAdmin = true // Placeholder for actual admin check

    if (!isAdmin) {
      return new Response('Unauthorized - Admin access required', { status: 403 })
    }

    console.log('Starting group chat transition...')

    // Parse the request body for any transition parameters, but never fail if it’s malformed.
    let transitionDate: string | null = null
    let algorithmOutput: unknown = null
    try {
      if (req.headers.get('content-type')?.includes('application/json')) {
        // Clone the request before reading the body to avoid Undici #state issues
        const clone = req.clone()
        const body = (await clone.json()) as {
          transitionDate?: string | null
          algorithmOutput?: unknown
        }
        transitionDate = body.transitionDate ?? null
        algorithmOutput = body.algorithmOutput ?? null
      }
    } catch {
      // Treat any parse error as "no transition params provided"
      transitionDate = null
      algorithmOutput = null
    }

    // Notify all connected clients that group chats are being transitioned
    // First, collect additional data for the notification
    const adminUser = {
      id: session.user.id,
      name: session.user.name || 'Admin',
      email: session.user.email || 'Unknown'
    }

    console.log('Notifying all users about group chat transition (started)')
    await pusherServer.trigger('global_notifications', 'group_chat_transition_started', {
      timestamp: Date.now(),
      message: 'Group chats are transitioning to new sets',
      initiatedBy: adminUser,
      transitionDate: transitionDate || null,
    })

    // Step 1: Get all users from the canonical index
    const indexedUserIds = await getAllAppUserIds()

    console.log(
      `[GroupChatTransition] Indexed user ids (${indexedUserIds.length}):`,
      indexedUserIds.join(', '),
    )

    // Also discover any users that appear as members of existing group chats.
    const existingGroupChatIds = await getAllGroupChatIds()

    // Store user rankings before deleting group chats
    for (const chatId of existingGroupChatIds) {
      try {
        // Find all ranking keys for this chat and preserve them
        const rankingKeys = await fetchRedis('keys', `ranking:${chatId}:*`) as string[]
        
        // Nothing to do if there are no rankings
        if (rankingKeys.length === 0) continue
        
        console.log(`Preserving ${rankingKeys.length} ranking records for chat ${chatId}`)
      } catch (error) {
        console.error(`Error preserving rankings for ${chatId}:`, error)
      }
    }
    
    // Build a superset of all users that have ever been in a group chat
    // plus those in the canonical index, so we never "lose" anyone just
    // because they weren't added to users:all yet.
    const usersFromChats = new Set<string>()
    for (const chatId of existingGroupChatIds) {
      try {
        const raw = (await fetchRedis('get', `chat:${chatId}`)) as string | null
        if (!raw) continue

        const chat = JSON.parse(raw) as GroupChat
        if (Array.isArray(chat.members)) {
          for (const memberId of chat.members) {
            usersFromChats.add(memberId)
          }
        }
      } catch (error) {
        console.error(`[GroupChatTransition] Failed to read members for ${chatId}:`, error)
      }
    }

    // Avoid downlevel Set iteration issues in TS builds by explicitly arrayifying inputs.
    const userIds = Array.from(
      new Set([...Array.from(indexedUserIds), ...Array.from(usersFromChats)]),
    )

    console.log(
      `[GroupChatTransition] All users to (re)assign (${userIds.length}):`,
      userIds.join(', '),
    )
    
    // Delete all group chat related keys
    for (const chatId of existingGroupChatIds) {
      const key = `chat:${chatId}`
      try {
        await db.del(key)
      } catch (error) {
        console.error(`Error deleting ${key}:`, error)
      }
    }
    
    // Clear the available group chats set
    await db.del('available_group_chats')
    
    // Clear user's current group chat settings for everyone we know about
    for (const userId of userIds) {
      await db.del(`user:${userId}:current_group_chat`)
      
      // Also clear their group_chats set (active chats)
      await db.del(`user:${userId}:group_chats`)
    }

    // Create new group chats using a simple random grouping algorithm:
    // take all users, randomly partition into groups of up to 5. Any
    // remainder forms a smaller final group.
    const groupChats = []
    let currentUserChatId = null

    const randomGroups = buildRandomGroups(userIds, 5)

    for (const groupMembers of randomGroups) {
      if (groupMembers.length === 0) continue

      const groupChatId = 'group_' + nanoid()

      const groupChat = {
        id: groupChatId,
        name: '',
        creatorId: session.user.id,
        members: groupMembers,
        createdAt: Date.now(),
        transitionDate: transitionDate || null
      }

      // Save group chat to Redis and track it in the index
      await Promise.all([
        db.set(`chat:${groupChatId}`, JSON.stringify(groupChat)),
        addGroupChatId(groupChatId),
      ])

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

    // Verify that all users have been properly assigned before returning
    const verificationPromises = []

    // Check that each user has a current group chat assigned
    for (const userId of userIds) {
      verificationPromises.push(
        (async () => {
          try {
            // Check if user has a current group chat
            const currentGroupChatRaw = await fetchRedis('get', `user:${userId}:current_group_chat`)
            if (!currentGroupChatRaw) {
              console.error(`User ${userId} does not have a current group chat assigned`)
              return false
            }
            
            const userChatId = currentGroupChatRaw as string
            
            // Check if the user's color is set
            const colorKey = `chat:${userChatId}:user:${userId}:color`
            const colorRaw = await fetchRedis('get', colorKey)
            if (!colorRaw) {
              console.error(`User ${userId} does not have a color assigned in chat ${userChatId}`)
              return false
            }
            
            return true
          } catch (error) {
            console.error(`Error verifying setup for user ${userId}:`, error)
            return false
          }
        })()
      )
    }

    // Wait for all verification checks to complete
    const verificationResults = await Promise.all(verificationPromises)
    const allUsersVerified = verificationResults.every(result => result === true)

    if (!allUsersVerified) {
      console.warn('Some users may not have been properly assigned to group chats')
    }

    // Add a small delay to ensure Redis has propagated all changes
    await new Promise(resolve => setTimeout(resolve, 500))

    // Store the transition information in Redis for users who might reconnect later
    // This lets the app know when the last transition happened
    const transitionInfo = {
      timestamp: Date.now(),
      adminUserId: session.user.id,
      adminUserName: session.user.name || 'Admin',
      groupChatCount: groupChats.length,
      transitionDate: transitionDate || null
    }

    // Store this in Redis so we can check it when users reconnect
    await db.set('last_group_chat_transition', JSON.stringify(transitionInfo))

    // Also store the transition history
    const transitionKey = `group_chat_transition:${Date.now()}`
    await db.set(transitionKey, JSON.stringify({
      ...transitionInfo,
      groupChats: groupChats.map(gc => ({ 
        chatId: gc.chatId, 
        memberCount: gc.members.length 
      }))
    }))

    // Now that all data is written, notify clients that the rebuild is complete.
    await pusherServer.trigger('global_notifications', 'group_chat_update', {
      eventType: 'rebuild',
      timestamp: Date.now(),
      message: 'Group chats have been transitioned to new sets',
      initiatedBy: adminUser,
      transitionDate: transitionDate || null,
    })

    // Return the response
    return new Response(
      JSON.stringify({
        success: true,
        message: `Created ${groupChats.length} group chats`,
        groupChats,
        currentUserChatId,
        transitionDate: transitionDate || null,
        allUsersVerified,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    )
  } catch (error) {
    console.error('Error transitioning group chats:', error)
    return new Response('Server error', { status: 500 })
  }
} 