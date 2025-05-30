'use client'

import { FC, useState, useEffect } from 'react'
import Messages from './Messages'
import ChatInput from './ChatInput'
import { Message } from '@/lib/validations/message'
import { Users, BarChart2 } from 'lucide-react'
import Image from 'next/image'
import UserRankingSidebar from './UserRankingSidebar'
import GroupChatLoadingState from './GroupChatLoadingState'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'
import { pusherClient } from '@/lib/pusher'

interface ChatWrapperProps {
  chatId: string
  initialMessages: Message[]
  sessionId: string
  sessionImg: string | null | undefined
  chatPartner: User | null
  title: string
  chatPartnerImage: string
  isGroupChat: boolean
  userColors: Record<string, string>
  members?: string[]
}

const ChatWrapper: FC<ChatWrapperProps> = ({
  chatId,
  initialMessages,
  sessionId,
  sessionImg,
  chatPartner,
  title,
  chatPartnerImage,
  isGroupChat,
  userColors,
  members = []
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(isGroupChat && chatId.startsWith('group_'))
  const router = useRouter()

  // Function to handle when the group chat is ready
  const handleChatReady = () => {
    setIsLoading(false)
  }
  
  // Listen for global transition events
  useEffect(() => {
    if (isGroupChat && chatId.startsWith('group_')) {
      const globalChannel = pusherClient.subscribe('global_notifications')
      
      const handleTransitionStarted = () => {
        // Immediately show loading state
        setIsLoading(true)
        toast.loading('Group chats are being rebuilt...', {
          id: 'chat-transition-toast',
          duration: 5000
        })
      }
      
      globalChannel.bind('group_chat_transition_started', handleTransitionStarted)
      
      return () => {
        pusherClient.unsubscribe('global_notifications')
      }
    }
  }, [isGroupChat, chatId])
  
  // Check if this is the user's current group chat - simplified to prevent redirect loops
  useEffect(() => {
    if (isGroupChat && chatId.startsWith('group_')) {
      const checkCurrentChat = async () => {
        try {
          // Use a direct fetch call with cache disabled
          const response = await fetch(`/api/group-chat/current?userId=${sessionId}`, {
            method: 'GET',
            headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
          })
          
          if (response.ok) {
            const data = await response.json()
            
            // Only redirect if there's a valid different chat ID
            if (data.id && data.id !== chatId && !data.error) {
              console.log(`Redirecting user from ${chatId} to current group chat ${data.id}`)
              
              // Display a single toast notification
              toast.success('Redirecting to your current group chat...', { 
                id: 'redirect-toast',  // Use an ID to prevent duplicate toasts
                duration: 3000 
              })
              
              // Perform a direct navigation without setTimeout
              window.location.href = `/dashboard/chat/${data.id}`
              
              // Return early to prevent further code execution
              return
            }
          }
        } catch (error) {
          console.error('Error checking current group chat:', error)
        }
      }
      
      // Run the check only once when the component mounts
      checkCurrentChat()
    }
  }, [isGroupChat, chatId, sessionId]) // Removed router and isCheckingCurrent dependencies

  // Show loading state if it's a group chat and still loading
  if (isLoading) {
    return <GroupChatLoadingState chatId={chatId} onChatReady={handleChatReady} />
  }

  return (
    <div className='flex-1 justify-between flex flex-col h-screen'>
      <div className='flex sm:items-center justify-between py-3 border-b-2 border-gray-200'>
        <div className='relative flex items-center space-x-4'>
          {/* Only show the image for direct chats, not group chats */}
          {!isGroupChat && (
            <div className='relative'>
              <div className='relative w-8 sm:w-12 h-8 sm:h-12'>
                <Image
                  fill
                  referrerPolicy='no-referrer'
                  src={chatPartnerImage}
                  alt={`${title} profile picture`}
                  className='rounded-full'
                />
              </div>
            </div>
          )}

          <div className='flex flex-col leading-tight'>
            {title && (
              <div className='text-xl flex items-center'>
                <span className='text-gray-700 mr-3 font-semibold'>
                  {title}
                </span>
              </div>
            )}

            {isGroupChat && (
              <span className='text-sm text-gray-600'>
                {members.length} members
              </span>
            )}
          </div>
        </div>

        {/* Rank users button - only shown for group chats */}
        {isGroupChat && (
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="flex items-center text-sm font-medium text-gray-700 hover:text-indigo-600 mr-4"
          >
            <BarChart2 className="h-5 w-5 mr-1" />
            <span>Rank Users</span>
          </button>
        )}
      </div>

      <Messages
        initialMessages={initialMessages}
        sessionId={sessionId}
        chatId={chatId}
        sessionImg={sessionImg}
        chatPartner={chatPartner}
        isGroupChat={isGroupChat}
        userColors={userColors}
      />
      <ChatInput chatId={chatId} />

      {/* User Ranking Sidebar */}
      {isGroupChat && (
        <UserRankingSidebar 
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          chatId={chatId}
          userColors={userColors}
          currentUserId={sessionId}
        />
      )}
    </div>
  )
}

export default ChatWrapper 