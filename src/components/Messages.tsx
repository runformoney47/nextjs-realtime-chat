'use client'

import { pusherClient } from '@/lib/pusher'
import { cn, toPusherKey } from '@/lib/utils'
import { Message } from '@/lib/validations/message'
import { format } from 'date-fns'
import Image from 'next/image'
import { FC, useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'

interface MessagesProps {
  initialMessages: Message[]
  sessionId: string
  chatId: string
  sessionImg: string | null | undefined
  chatPartner: User | null
  isGroupChat?: boolean
  userColors?: Record<string, string>
}

const Messages: FC<MessagesProps> = ({
  initialMessages,
  sessionId,
  chatId,
  chatPartner,
  sessionImg,
  isGroupChat = false,
  userColors = {}
}) => {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const scrollDownRef = useRef<HTMLDivElement | null>(null)

  const formatTimestamp = (timestamp: number) => {
    return format(timestamp, 'HH:mm')
  }

  // Color mapping for the user colors
  const colorMap = {
    Green: '#4CAF50',
    Yellow: '#FFEB3B',
    Orange: '#FF9800',
    Red: '#F44336',
    Violet: '#9C27B0'
  }

  useEffect(() => {
    const channelName = toPusherKey(`chat:${chatId}`)
    console.log(`Subscribing to Pusher channel: ${channelName}`)
    
    const channel = pusherClient.subscribe(channelName)

    channel.bind('pusher:subscription_succeeded', () => {
      console.log(`Successfully subscribed to channel: ${channelName}`)
    })

    channel.bind('pusher:subscription_error', (error: any) => {
      console.error(`Error subscribing to ${channelName}:`, error)
      toast.error('Error connecting to chat channel')
    })

    const messageHandler = (message: Message) => {
      console.log('New message received:', message)
      setMessages((prev) => [message, ...prev])
    }

    channel.bind('incoming-message', messageHandler)

    return () => {
      console.log(`Unsubscribing from channel: ${channelName}`)
      pusherClient.unsubscribe(channelName)
    }
  }, [chatId])

  // Auto-scroll to latest message
  useEffect(() => {
    scrollDownRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div
      id='messages'
      className='flex h-full flex-1 flex-col-reverse gap-4 p-3 overflow-y-auto scrollbar-thumb-blue scrollbar-thumb-rounded scrollbar-track-blue-lighter scrollbar-w-2 scrolling-touch'>
      <div ref={scrollDownRef} />

      {messages.map((message, index) => {
        const isCurrentUser = message.senderId === sessionId
        const hasNextMessageFromSameUser =
          messages[index - 1]?.senderId === messages[index].senderId

        // Get the color for this user
        const userColor = isGroupChat && userColors[message.senderId]
          ? userColors[message.senderId]
          : null

        // For anonymous group chats
        const userName = isGroupChat
          ? (isCurrentUser ? "You" : userColor || "Anonymous")
          : (isCurrentUser ? "You" : chatPartner?.name || "User")

        // Determine circle background color
        const circleStyle = {
          backgroundColor: userColor && colorMap[userColor as keyof typeof colorMap]
            ? colorMap[userColor as keyof typeof colorMap]
            : '#cccccc' // Default gray
        }

        // Determine the message style based on sender and group chat status
        const getMessageStyle = () => {
          if (isCurrentUser) {
            return { 
              backgroundColor: '#4F46E5', // indigo-600
              color: 'white' 
            }
          } 
          
          if (isGroupChat && userColor) {
            // Use the color name to get the hex value
            const bgColor = colorMap[userColor as keyof typeof colorMap] || '#E5E7EB' // Default to gray-200
            
            // Determine text color based on background brightness
            const textColor = ['Yellow', 'Green'].includes(userColor) ? 'black' : 'white'
            
            return { 
              backgroundColor: bgColor,
              color: textColor
            }
          }
          
          // Default for non-group chats
          return { 
            backgroundColor: '#E5E7EB', // gray-200 
            color: 'black'
          }
        }

        return (
          <div
            className='chat-message'
            key={`${message.id}-${message.timestamp}`}>
            <div
              className={cn('flex items-end', {
                'justify-end': isCurrentUser,
              })}>
              
              {/* User color indicator for group chats */}
              {isGroupChat && !isCurrentUser && (
                <div 
                  className={cn('relative w-6 h-6 rounded-full flex items-center justify-center mr-2', {
                    'order-1': !isCurrentUser,
                    invisible: hasNextMessageFromSameUser,
                  })}
                  style={circleStyle}>
                </div>
              )}

              <div
                className={cn(
                  'flex flex-col space-y-2 text-base max-w-xs mx-2',
                  {
                    'order-1 items-end': isCurrentUser,
                    'order-2 items-start': !isCurrentUser,
                  }
                )}>
                {/* Show sender name in group chats */}
                {isGroupChat && !hasNextMessageFromSameUser && (
                  <span className='text-xs text-gray-500 mb-1'>
                    {userName}
                  </span>
                )}
                
                <span
                  className={cn('px-4 py-2 rounded-lg inline-block', {
                    'rounded-br-none': !hasNextMessageFromSameUser && isCurrentUser,
                    'rounded-bl-none': !hasNextMessageFromSameUser && !isCurrentUser,
                  })}
                  style={getMessageStyle()}>
                  {message.text}{' '}
                  <span className='ml-2 text-xs opacity-70'>
                    {formatTimestamp(message.timestamp)}
                  </span>
                </span>
              </div>

              {!isGroupChat && (
                <div
                  className={cn('relative w-6 h-6', {
                    'order-2': isCurrentUser,
                    'order-1': !isCurrentUser,
                    invisible: hasNextMessageFromSameUser,
                  })}>
                  <Image
                    fill
                    src={
                      isCurrentUser ? (sessionImg as string) : (chatPartner?.image as string)
                    }
                    alt='Profile picture'
                    referrerPolicy='no-referrer'
                    className='rounded-full'
                  />
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default Messages
