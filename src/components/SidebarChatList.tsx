'use client'

import { pusherClient } from '@/lib/pusher'
import { chatHrefConstructor, toPusherKey } from '@/lib/utils'
import { usePathname, useRouter } from 'next/navigation'
import { FC, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import UnseenChatToast from './UnseenChatToast'
import { Users } from 'lucide-react'
import Link from 'next/link'

interface SidebarChatListProps {
  friends: User[]
  sessionId: string
}

interface ExtendedMessage extends Message {
  senderImg: string
  senderName: string
}

const SidebarChatList: FC<SidebarChatListProps> = ({ friends, sessionId }) => {
  const router = useRouter()
  const pathname = usePathname()
  const [unseenMessages, setUnseenMessages] = useState<Message[]>([])
  const [activeChats, setActiveChats] = useState<User[]>(friends)
  const [currentGroupChatId, setCurrentGroupChatId] = useState<string | null>(null)
  const [groupChatChanged, setGroupChatChanged] = useState<boolean>(false)

  // Fetch current group chat
  useEffect(() => {
    const fetchCurrentGroupChat = async () => {
      try {
        const response = await fetch(`/api/group-chat/current?userId=${sessionId}`, {
          method: 'GET',
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
        })
        
        if (response.ok) {
          const data = await response.json()
          if (data.id) {
            setCurrentGroupChatId(data.id)
          }
        }
      } catch (error) {
        console.error('Failed to fetch current group chat:', error)
      }
    }

    fetchCurrentGroupChat()
  }, [sessionId])

  useEffect(() => {
    // Subscribe to Pusher channels
    const userChatsChannel = pusherClient.subscribe(toPusherKey(`user:${sessionId}:chats`))
    const userFriendsChannel = pusherClient.subscribe(toPusherKey(`user:${sessionId}:friends`))
    const globalChannel = pusherClient.subscribe('global_notifications')

    const chatHandler = (message: ExtendedMessage) => {
      const shouldNotify =
        pathname !==
        `/dashboard/chat/${chatHrefConstructor(sessionId, message.senderId)}`

      if (!shouldNotify) return

      // should be notified
      toast.custom((t) => (
        <UnseenChatToast
          t={t}
          sessionId={sessionId}
          senderId={message.senderId}
          senderImg={message.senderImg}
          senderMessage={message.text}
          senderName={message.senderName}
        />
      ))

      setUnseenMessages((prev) => [...prev, message])
    }

    const newFriendHandler = (newFriend: User) => {
      setActiveChats((prev) => [...prev, newFriend])
    }

    // Simplified group chat update handler
    const groupChatUpdateHandler = (data: { eventType: string }) => {
      console.log("Received group chat update:", data)
      
      if (data.eventType === 'rebuild') {
        // Show notification
        toast.success('Group chats have been updated!', {
          id: 'group-rebuild-toast',
          duration: 5000
        })
        
        // Set flag to show notification in the sidebar
        setGroupChatChanged(true)
        
        // Refresh the user's current group chat ID
        const refreshGroupChat = async () => {
          try {
            const response = await fetch(`/api/group-chat/current?userId=${sessionId}`, {
              method: 'GET',
              headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
            })
            
            if (response.ok) {
              const data = await response.json()
              if (data.id) {
                setCurrentGroupChatId(data.id)
                
                // If user is currently in a group chat, redirect to the new one
                if (pathname?.startsWith('/dashboard/chat/group_')) {
                  // If they're already on the correct page, just refresh
                  if (pathname === `/dashboard/chat/${data.id}`) {
                    window.location.reload()
                  } else {
                    // Otherwise redirect
                    window.location.href = `/dashboard/chat/${data.id}`
                  }
                }
              }
            }
          } catch (error) {
            console.error('Failed to refresh current group chat:', error)
          }
        }
        
        refreshGroupChat()
      }
    }
    
    // Handle transition started notification
    const transitionStartedHandler = (data: any) => {
      console.log("Group chat transition started:", data)
      
      // Show an immediate loading toast to all users
      toast.loading('Group chats are being updated. Please wait...', {
        id: 'transition-started-toast',
        duration: 10000
      })
      
      // If user is in a group chat page, show loading screen
      if (pathname?.startsWith('/dashboard/chat/group_')) {
        // Force reload to show loading state
        window.location.reload()
      }
    }

    userChatsChannel.bind('new_message', chatHandler)
    userFriendsChannel.bind('new_friend', newFriendHandler)
    globalChannel.bind('group_chat_update', groupChatUpdateHandler)
    globalChannel.bind('group_chat_transition_started', transitionStartedHandler)

    return () => {
      pusherClient.unsubscribe(toPusherKey(`user:${sessionId}:chats`))
      pusherClient.unsubscribe(toPusherKey(`user:${sessionId}:friends`))
      pusherClient.unsubscribe('global_notifications')
    }
  }, [pathname, sessionId, router])

  useEffect(() => {
    if (pathname?.includes('chat')) {
      setUnseenMessages((prev) => {
        return prev.filter((msg) => !pathname.includes(msg.senderId))
      })
    }
  }, [pathname])

  // Function to handle clicking on current group chat
  const handleGroupChatClick = () => {
    // Reset the notification if user clicks on the group chat
    setGroupChatChanged(false)
  }

  return (
    <div>
      {/* Current Group Chat button */}
      <div className="mb-4">
        <Link 
          href={currentGroupChatId ? `/dashboard/chat/${currentGroupChatId}` : '/dashboard'}
          className='text-gray-700 hover:text-indigo-600 hover:bg-gray-50 group flex items-center gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold bg-gray-50 relative'
          onClick={handleGroupChatClick}
        >
          <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
            <Users className="h-4 w-4" />
          </div>
          Current Groupchat
          
          {/* Show notification badge if group chats have changed */}
          {groupChatChanged && (
            <span className="absolute right-1 top-1 bg-green-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
              New
            </span>
          )}
        </Link>
      </div>

      {/* Regular friend list title */}
      <div className='text-xs font-semibold leading-6 text-gray-400 mb-2'>
        Your direct messages
      </div>

      {/* One-to-one Chats */}
      <ul role='list' className='max-h-[25rem] overflow-y-auto -mx-2 space-y-1'>
        {activeChats.sort().map((friend) => {
          const unseenMessagesCount = unseenMessages.filter((unseenMsg) => {
            return unseenMsg.senderId === friend.id
          }).length

          return (
            <li key={friend.id}>
              <a
                href={`/dashboard/chat/${chatHrefConstructor(
                  sessionId,
                  friend.id
                )}`}
                className='text-gray-700 hover:text-indigo-600 hover:bg-gray-50 group flex items-center gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold'>
                {friend.name}
                {unseenMessagesCount > 0 ? (
                  <div className='bg-indigo-600 font-medium text-xs text-white w-4 h-4 rounded-full flex justify-center items-center'>
                    {unseenMessagesCount}
                  </div>
                ) : null}
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default SidebarChatList
