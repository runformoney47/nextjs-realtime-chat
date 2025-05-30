'use client'

import { FC, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

interface GroupChatLoadingStateProps {
  chatId: string
  onChatReady: () => void
}

const GroupChatLoadingState: FC<GroupChatLoadingStateProps> = ({
  chatId,
  onChatReady
}) => {
  const [loadingMessage, setLoadingMessage] = useState('Connecting to group chat...')
  
  useEffect(() => {
    const checkChatExists = async () => {
      try {
        // Simple check if the chat exists
        const response = await fetch(`/api/group-chat/check?chatId=${chatId}`, {
          method: 'GET',
          headers: { 'Cache-Control': 'no-cache' }
        })
        
        if (response.ok) {
          const data = await response.json()
          
          if (data.exists) {
            // Chat is ready, notify parent
            onChatReady()
          } else {
            // Chat doesn't exist yet, show appropriate message
            setLoadingMessage('Waiting for group chat to be ready...')
            
            // Check again in a moment
            setTimeout(checkChatExists, 2000)
          }
        } else {
          // If API fails, assume chat is ready to avoid getting stuck
          onChatReady()
        }
      } catch (error) {
        console.error('Error checking if chat exists:', error)
        // On error, assume chat is ready to avoid getting stuck
        onChatReady()
      }
    }
    
    // Start the check
    checkChatExists()
  }, [chatId, onChatReady])
  
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
      <div className="text-center p-8 max-w-md">
        <div className="flex justify-center mb-4">
          <LoadingSpinner size={40} />
        </div>
        <h3 className="text-xl font-medium text-gray-900 mb-2">
          {loadingMessage}
        </h3>
        <p className="text-gray-500">
          This may take a moment...
        </p>
      </div>
    </div>
  )
}

const LoadingSpinner = ({ size = 24 }) => (
  <div className="animate-spin rounded-full border-t-2 border-b-2 border-indigo-500" 
    style={{ width: `${size}px`, height: `${size}px` }}>
  </div>
)

export default GroupChatLoadingState 