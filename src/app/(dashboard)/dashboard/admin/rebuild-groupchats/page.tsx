'use client'

import Button from '@/components/ui/Button'
import { FC, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

interface PageProps {}

const RebuildGroupChatsPage: FC<PageProps> = ({}) => {
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [result, setResult] = useState<any>(null)
  const [transitionDate, setTransitionDate] = useState<string>('')
  const [transitionStep, setTransitionStep] = useState<string>('')
  const router = useRouter()

  const handleRebuild = async () => {
    setIsLoading(true)
    setTransitionStep('Starting transition process...')
    
    // Immediately trigger a global notification to show loading states on all clients
    try {
      // First notify all connected clients about the upcoming transition
      const notifyResponse = await fetch('/api/notifications/global', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'group_chat_transition_started',
          message: 'Group chat transition is starting...'
        }),
      });
      
      if (!notifyResponse.ok) {
        console.warn('Failed to send global notification, proceeding anyway');
      }
      
      // Show toast for admin
      toast.loading('Rebuilding group chats. Please wait...', {
        id: 'rebuild-toast',
        duration: 5000,
      })
      
      setTransitionStep('Notifying all users about the transition')
      
      // Use the transition endpoint
      setTransitionStep('Creating new group chat assignments')
      const response = await fetch('/api/group-chat/transition', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transitionDate: transitionDate ? new Date(transitionDate).getTime() : null,
        }),
      })

      setTransitionStep('Finalizing group chat assignments')
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to rebuild group chats')
      }
      
      setResult(data)
      toast.dismiss('rebuild-toast')
      
      if (data.allUsersVerified) {
        setTransitionStep('All users have been successfully assigned to new group chats')
        toast.success('Group chats have been rebuilt successfully!')
      } else {
        setTransitionStep('Transition completed with some warnings - check logs')
        toast.success('Group chats rebuilt, but some users may need to refresh their browser')
      }
      
      // Wait a moment before redirect 
      setTransitionStep('Redirecting to your new group chat...')
      setTimeout(() => {
        // Get the current user's new chat ID from the response and redirect
        if (data.currentUserChatId) {
          window.location.href = `/dashboard/chat/${data.currentUserChatId}`
        } else {
          // If not available, refresh the dashboard
          window.location.href = '/dashboard'
        }
      }, 2000)
    } catch (error) {
      console.error('Error rebuilding group chats:', error)
      toast.dismiss('rebuild-toast')
      toast.error('Failed to rebuild group chats. Please try again.')
      setTransitionStep('Error occurred during transition')
      setIsLoading(false)
    }
  }

  return (
    <div className='container py-12'>
      <h1 className='font-bold text-5xl mb-8'>Rebuild Group Chats</h1>
      
      <div className='max-w-3xl'>
        <p className='mb-4 text-lg'>
          This tool will advance users to the next set of group chats, ensuring:
        </p>
        
        <ul className='list-disc pl-6 mb-6 space-y-2'>
          <li>Each user is assigned to a group of up to 5 people</li>
          <li>Each user gets a unique color in their group (Green, Yellow, Orange, Red, or Violet)</li>
          <li>All users maintain their anonymity in group chats</li>
          <li>Users will be automatically redirected to their new group chat</li>
        </ul>
        
        <div className='bg-yellow-50 border border-yellow-200 p-4 rounded-md mb-8'>
          <h3 className='text-yellow-800 font-semibold mb-2'>Important Note</h3>
          <p className='text-yellow-800 mb-2'>
            This process may take a few moments to complete. All users will see a loading screen until their new group chat is ready.
          </p>
          <p className='text-yellow-700'>
            Current group chat messages will be preserved but not accessible through the regular interface.
          </p>
        </div>
        
        {/* Optional scheduled transition date */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Scheduled Transition Date (Optional)
          </label>
          <input
            type="datetime-local"
            value={transitionDate}
            onChange={(e) => setTransitionDate(e.target.value)}
            className="w-full p-2 border rounded mb-2"
            disabled={isLoading}
          />
          <p className="text-xs text-gray-500">
            If set, this will be recorded as the official transition date. Leave empty for immediate transition.
          </p>
        </div>
        
        {isLoading ? (
          <div className="bg-white p-4 rounded-md shadow-sm border border-gray-200 mb-8">
            <div className="flex items-center mb-4">
              <Loader2 className="h-5 w-5 text-indigo-600 animate-spin mr-2" />
              <span className="font-medium text-gray-700">Transition in Progress</span>
            </div>
            <p className="text-gray-600 mb-2">{transitionStep}</p>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div className="bg-indigo-600 h-2.5 rounded-full animate-pulse"></div>
            </div>
            <p className="mt-4 text-sm text-gray-500">
              Please do not close this page until the process completes.
            </p>
          </div>
        ) : (
          <Button
            isLoading={isLoading}
            onClick={handleRebuild}
            type='button'>
            Advance to Next Group Chat Set
          </Button>
        )}
        
        {result && !isLoading && (
          <div className='mt-8 bg-gray-50 p-4 rounded-md'>
            <h2 className='text-xl font-semibold mb-2'>Results</h2>
            <p>Successfully created {result.groupChats.length} group chats</p>
            {result.transitionDate && (
              <p className="mt-2">
                Transition date: {new Date(result.transitionDate).toLocaleString()}
              </p>
            )}
            {result.allUsersVerified === false && (
              <p className="mt-2 text-amber-600">
                Note: Some users may need to refresh their browser to see their new group chat.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default RebuildGroupChatsPage 