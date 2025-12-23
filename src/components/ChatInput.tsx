'use client'

import { FC, useRef, useState } from 'react'
import TextareaAutosize from 'react-textarea-autosize'
import axios from 'axios'
import { toast } from 'react-hot-toast'
import { nanoid } from 'nanoid'
import Button from './ui/Button'
import type { Message } from '@/lib/validations/message'

interface ChatInputProps {
  chatId: string
  sessionId: string
}

const ChatInput: FC<ChatInputProps> = ({ chatId, sessionId }) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [input, setInput] = useState<string>('')
  const [isTyping, setIsTyping] = useState<boolean>(false)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sendTyping = async (status: 'start' | 'stop') => {
    try {
      const params = new URLSearchParams({
        chatId,
        status,
      })
      await axios.post(`/api/message/typing?${params.toString()}`)
    } catch {
      // Typing indicators are best-effort; ignore failures.
    }
  }

  const handleInputChange = (value: string) => {
    setInput(value)

    // On first keystroke after idle, emit "start typing"
    if (!isTyping && value.trim().length > 0) {
      setIsTyping(true)
      void sendTyping('start')
    }

    // Reset the "stop typing" debounce
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    if (value.trim().length === 0) {
      // If input cleared, immediately send stop
      if (isTyping) {
        setIsTyping(false)
        void sendTyping('stop')
      }
      return
    }

    typingTimeoutRef.current = setTimeout(() => {
      if (isTyping) {
        setIsTyping(false)
        void sendTyping('stop')
      }
    }, 5000)
  }

  const sendMessage = async () => {
    const trimmed = input.trim()
    if (!trimmed) return

    // As soon as the user sends a message, immediately clear typing state
    // so the indicator disappears before the message is received/rendered.
    if (isTyping) {
      setIsTyping(false)
      void sendTyping('stop')
    }

    setIsLoading(true)

    // Generate a client-side id so the message can appear immediately and
    // de-duplicate when the server broadcast arrives.
    const messageId = nanoid()
    const timestamp = Date.now()

    // Clear the input immediately so the UI feels instant.
    setInput('')

    // Fire an optimistic local event so the message shows up instantly.
    const optimisticMessage: Message = {
      id: messageId,
      senderId: sessionId,
      text: trimmed,
      timestamp,
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('chat:optimistic-message', {
          detail: {
            chatId,
            message: optimisticMessage,
          },
        }),
      )
    }

    try {
      const params = new URLSearchParams({
        text: trimmed,
        chatId,
        id: messageId,
      })

      await axios.post(`/api/message/send?${params.toString()}`)
      textareaRef.current?.focus()
    } catch (error) {
      toast.error('Something went wrong. Please try again later.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className='border-t border-gray-200 px-4 py-3'>
      <div className='flex items-center rounded-full border border-gray-300 bg-white px-4 py-2 shadow-sm'>
        <TextareaAutosize
          ref={textareaRef}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              sendMessage()
            }
          }}
          rows={1}
          maxRows={1}
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder='Type a message'
          className='flex-1 resize-none border-0 bg-transparent text-gray-900 placeholder:text-gray-400 focus:ring-0 text-sm leading-6'
        />

        <Button
          isLoading={isLoading}
          onClick={sendMessage}
          type='submit'
          size='sm'
          className='ml-2 h-6 px-2 text-[11px] leading-none py-0'
        >
          Send
        </Button>
      </div>
    </div>
  )
}

export default ChatInput
