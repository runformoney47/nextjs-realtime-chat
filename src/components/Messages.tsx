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
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const typingTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

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

    const applyMessage = (message: Message) => {
      setMessages((prev) => {
        // Avoid duplicates and keep messages sorted by timestamp
        const exists = prev.some((m) => m.id === message.id)
        const next = exists ? prev : [...prev, message]
        return [...next].sort((a, b) => a.timestamp - b.timestamp)
      })
    }

    const messageHandler = (message: Message) => {
      console.log('New message received:', message)
      applyMessage(message)
    }

    channel.bind('incoming-message', messageHandler)

    type TypingPayload = {
      userId: string
      status: 'start' | 'stop'
      timestamp: number
    }

    const typingHandler = (payload: TypingPayload) => {
      if (!payload || !payload.userId) return
      // Do not show typing indicator for the current user
      if (payload.userId === sessionId) return

      const userId = payload.userId

      // Clear any existing timeout for this user
      const existingTimeout = typingTimeoutsRef.current[userId]
      if (existingTimeout) {
        clearTimeout(existingTimeout)
        delete typingTimeoutsRef.current[userId]
      }

      if (payload.status === 'start') {
        // Add user to typing list
        setTypingUsers((prev) =>
          prev.includes(userId) ? prev : [...prev, userId],
        )

        // Auto-expire typing state after a generous window if no "stop" is received
        typingTimeoutsRef.current[userId] = setTimeout(() => {
          setTypingUsers((prev) => prev.filter((id) => id !== userId))
          delete typingTimeoutsRef.current[userId]
        }, 20000)
      } else if (payload.status === 'stop') {
        setTypingUsers((prev) => prev.filter((id) => id !== userId))
      }
    }

    channel.bind('typing', typingHandler)

    // Optimistic local messages: listen for client-side events so that
    // messages appear instantly when the user hits send.
    const optimisticHandler = (event: Event) => {
      const custom = event as CustomEvent<{ chatId: string; message: Message }>
      if (!custom.detail) return
      if (custom.detail.chatId !== chatId) return
      applyMessage(custom.detail.message)
    }

    window.addEventListener('chat:optimistic-message', optimisticHandler as EventListener)

    // One-time sync to ensure we didn't miss any messages between
    // server render and Pusher subscription.
    const syncLatest = async () => {
      try {
        const res = await fetch(`/api/message/list?chatId=${encodeURIComponent(chatId)}`, {
          method: 'GET',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        })

        if (!res.ok) {
          console.warn('[Messages] Failed to sync latest messages', res.status)
          return
        }

        const data = (await res.json()) as { messages?: Message[] }
        if (!data.messages || !Array.isArray(data.messages)) return

        setMessages((prev) => {
          const byId = new Map<string, Message>()
          // Start with existing messages
          for (const m of prev) {
            byId.set(m.id, m)
          }
          // Merge in any from the server
          for (const m of data.messages) {
            const existing = byId.get(m.id)
            if (!existing || existing.timestamp !== m.timestamp || existing.text !== m.text) {
              byId.set(m.id, m)
            }
          }
          return Array.from(byId.values()).sort((a, b) => a.timestamp - b.timestamp)
        })
      } catch (error) {
        console.error('[Messages] Error during syncLatest', error)
      }
    }

    void syncLatest()

    return () => {
      console.log(`Unsubscribing from channel: ${channelName}`)
      pusherClient.unsubscribe(channelName)
      // Clear any pending typing timeouts
      Object.values(typingTimeoutsRef.current).forEach((timeoutId) =>
        clearTimeout(timeoutId),
      )
      typingTimeoutsRef.current = {}
      window.removeEventListener('chat:optimistic-message', optimisticHandler as EventListener)
    }
  }, [chatId, sessionId])

  // Auto-scroll to latest message
  useEffect(() => {
    scrollDownRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className='flex flex-1 flex-col h-full overflow-hidden'>
      {/* Scrollable messages container */}
      <div
        id='messages'
        className='flex-1 flex flex-col gap-4 p-3 overflow-y-auto scrollbar-thumb-blue scrollbar-thumb-rounded scrollbar-track-blue-lighter scrollbar-w-2 scrolling-touch'>

        {messages.map((message, index) => {
        const isCurrentUser = message.senderId === sessionId

        // Message grouping (classic chat behavior):
        // - A "burst" is consecutive messages from the same sender within a short time window.
        // - Show the sender label only at the start of a burst.
        const prevMessage = messages[index - 1]
        const nextMessage = messages[index + 1]
        const FIVE_MINUTES_MS = 5 * 60 * 1000

        const isSameAsPrevSender = prevMessage?.senderId === message.senderId
        const isWithinBurstWindow =
          prevMessage ? message.timestamp - prevMessage.timestamp <= FIVE_MINUTES_MS : false
        const isStartOfBurst = !prevMessage || !isSameAsPrevSender || !isWithinBurstWindow

        // Check if the NEXT message is from the same user (used for "tail" / avatar placement on the last message)
        const hasNextMessageFromSameUser = nextMessage?.senderId === message.senderId

        // Get the color for this user (including the current user)
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
          // For group chats, use the user's assigned color for ALL users (including current user)
          if (isGroupChat && userColor) {
            const bgColor = colorMap[userColor as keyof typeof colorMap] || '#E5E7EB'
            const textColor = ['Yellow', 'Green'].includes(userColor) ? 'black' : 'white'
            
            return { 
              backgroundColor: bgColor,
              color: textColor
            }
          }
          
          // For non-group chats: current user gets indigo, chat partner gets gray
          if (isCurrentUser) {
            return { 
              backgroundColor: '#4F46E5', // indigo-600
              color: 'white' 
            }
          }
          
          // Default for non-group chats (chat partner's messages)
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
                {/* Show sender name in group chats (only for other users, only at start of a burst) */}
                {isGroupChat && !isCurrentUser && isStartOfBurst && (
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
        <div ref={scrollDownRef} />
      </div>

      {/* Typing indicators – fixed above the chat input, outside scrollable area */}
      {typingUsers.length > 0 && (
        <div className='flex flex-row flex-wrap gap-2 py-2 px-4 border-t border-gray-100 bg-white'>
          {typingUsers.map((userId) => {
            const colorName =
              isGroupChat && userColors[userId]
                ? userColors[userId]
                : null

            const bgColor =
              colorName && colorMap[colorName as keyof typeof colorMap]
                ? colorMap[colorName as keyof typeof colorMap]
                : '#E5E7EB'

            const isLight = colorName === 'Yellow' || colorName === 'Green'
            const dotColor = isLight ? '#000000' : '#ffffff'

            return (
              <div
                key={userId}
                className='flex items-center rounded-full px-3 py-1 shadow-sm'
                style={{ backgroundColor: bgColor }}
              >
                <div className='flex items-center space-x-1'>
                  <span
                    className='w-1.5 h-1.5 rounded-full animate-bounce opacity-70'
                    style={{ backgroundColor: dotColor, animationDelay: '0ms' }}
                  />
                  <span
                    className='w-1.5 h-1.5 rounded-full animate-bounce opacity-70'
                    style={{ backgroundColor: dotColor, animationDelay: '150ms' }}
                  />
                  <span
                    className='w-1.5 h-1.5 rounded-full animate-bounce opacity-70'
                    style={{ backgroundColor: dotColor, animationDelay: '300ms' }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default Messages
