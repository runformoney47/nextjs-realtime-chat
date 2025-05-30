import { fetchRedis } from '@/helpers/redis'
import { authOptions } from '@/lib/auth'
import { getServerSession } from 'next-auth'
import { FC } from 'react'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import { nanoid } from 'nanoid'
import { redirect } from 'next/navigation'

// The list of colors for anonymous identities
const COLORS = ['Green', 'Yellow', 'Orange', 'Red', 'Violet']

interface pageProps {}

const page = async ({}) => {
  const session = await getServerSession(authOptions)
  if (!session) notFound()

  const userId = session.user.id
  console.log("Creating or joining group chat for user:", userId)

  // Check if user already has a current group chat
  const currentGroupChatId = await fetchRedis('get', `user:${userId}:current_group_chat`) as string | null

  if (currentGroupChatId) {
    console.log(`User already has group chat: ${currentGroupChatId}`)
    // If they already have a group, redirect them to it
    redirect(`/dashboard/chat/${currentGroupChatId}`)
  }

  // Look for an available group chat with less than 5 members
  const availableGroupChats = await fetchRedis('smembers', 'available_group_chats') as string[]
  console.log(`Found ${availableGroupChats.length} available group chats`)

  let groupChatId = null

  if (availableGroupChats.length > 0) {
    // Join an existing available group
    groupChatId = availableGroupChats[0]
    console.log(`Joining existing group chat: ${groupChatId}`)
    
    // Get the current chat data
    const chatRaw = await fetchRedis('get', `chat:${groupChatId}`) as string
    const chat = JSON.parse(chatRaw) as GroupChat
    
    // Add this user to the chat
    const userIndex = chat.members.length // Index to assign color
    const userColor = COLORS[userIndex % COLORS.length] // Use modulo to ensure we don't go out of bounds
    
    console.log(`Joining as member #${userIndex + 1} of ${chat.members.length + 1}`)
    console.log(`Assigning color "${userColor}" to user ${userId}`)
    chat.members.push(userId)
    
    // Assign anonymous identity to this user in this chat
    console.log(`Setting Redis key: chat:${groupChatId}:user:${userId}:color = ${userColor}`)
    await db.set(`chat:${groupChatId}:user:${userId}:color`, userColor)
    
    // Verify color was set
    const colorVerify = await fetchRedis('get', `chat:${groupChatId}:user:${userId}:color`) as string | null
    console.log(`Verification - Color for user ${userId}: ${colorVerify}`)
    
    // Check if the group is now full (5 members)
    if (chat.members.length >= 5) {
      console.log(`Group is now full with ${chat.members.length} members, removing from available list`)
      await db.srem('available_group_chats', groupChatId)
    }
    
    // Update the chat data
    console.log(`Updating chat data with new member list: ${chat.members.join(', ')}`)
    await db.set(`chat:${groupChatId}`, JSON.stringify(chat))
  } else {
    // Create a new group chat
    groupChatId = 'group_' + nanoid()
    const userColor = COLORS[0]
    
    console.log(`Creating new group chat: ${groupChatId}`)
    console.log(`Assigning color "${userColor}" to creator ${userId}`)
    
    const newGroupChat: GroupChat = {
      id: groupChatId,
      name: '',
      creatorId: userId,
      members: [userId],
      createdAt: Date.now()
    }
    
    // Add this user to the chat and set their color
    console.log(`Setting Redis key: chat:${groupChatId}:user:${userId}:color = ${userColor}`)
    await db.set(`chat:${groupChatId}:user:${userId}:color`, userColor)
    
    // Verify color was set
    const colorVerify = await fetchRedis('get', `chat:${groupChatId}:user:${userId}:color`) as string | null
    console.log(`Verification - Color for user ${userId}: ${colorVerify}`)
    
    // Store the new chat
    console.log(`Storing new chat with ID: ${groupChatId}`)
    await Promise.all([
      db.set(`chat:${groupChatId}`, JSON.stringify(newGroupChat)),
      db.sadd('available_group_chats', groupChatId)
    ])
  }
  
  // Set this as the user's current group chat
  console.log(`Setting current group chat for user ${userId}: ${groupChatId}`)
  await db.set(`user:${userId}:current_group_chat`, groupChatId)
  
  // Add this chat to the user's list of group chats
  console.log(`Adding chat to user's group_chats set`)
  await db.sadd(`user:${userId}:group_chats`, groupChatId)
  
  // Notify the user about their new group chat via Pusher
  console.log(`Sending Pusher notification for new group chat`)
  await pusherServer.trigger(
    toPusherKey(`user:${userId}:group_chats`),
    'new_group_chat',
    { id: groupChatId }
  )
  
  // Redirect to the group chat
  console.log(`Redirecting to chat: ${groupChatId}`)
  redirect(`/dashboard/chat/${groupChatId}`)
}

export default page 