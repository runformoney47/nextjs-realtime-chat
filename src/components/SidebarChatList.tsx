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

    userChatsChannel.bind('new_message', chatHandler)
    userFriendsChannel.bind('new_friend', newFriendHandler)

    return () => {
      userChatsChannel.unbind('new_message', chatHandler)
      userFriendsChannel.unbind('new_friend', newFriendHandler)
    }
  }, [pathname, sessionId, router])

  useEffect(() => {
    if (pathname?.includes('chat')) {
      setUnseenMessages((prev) => {
        return prev.filter((msg) => !pathname.includes(msg.senderId))
      })
    }
  }, [pathname])

  return (
    <div>
      {/* Current Group Chat button */}
      <div className="mb-4">
        <Link 
          href={currentGroupChatId ? `/dashboard/chat/${currentGroupChatId}` : '/dashboard'}
          className='text-gray-700 hover:text-indigo-600 hover:bg-gray-50 group flex items-center gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold bg-gray-50 relative'
        >
          <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
            <Users className="h-4 w-4" />
          </div>
          Current Groupchat
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
