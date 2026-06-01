'use client'

import { FC } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { MessageCircle, Users, LogOut } from 'lucide-react'

interface UserNavigationProps {
  currentGroupChatId: string | null
  userName: string | null
}

const UserNavigation: FC<UserNavigationProps> = ({ currentGroupChatId, userName }) => {
  const router = useRouter()

  const handleChatClick = () => {
    if (currentGroupChatId) {
      router.push(`/dashboard/chat/${currentGroupChatId}`)
    }
  }

  const handleSurveyClick = () => {
    router.push('/dashboard/survey')
  }

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/login' })
  }

  return (
    <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 bg-white">
      {/* Username and logout on left */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-700">{userName || 'User'}</span>
        <button
          onClick={handleLogout}
          className="
            flex items-center justify-center w-8 h-8 rounded-full 
            bg-gray-200 hover:bg-gray-300 hover:scale-105
            transition-all duration-200 cursor-pointer
          "
          title="Logout"
        >
          <LogOut className="h-4 w-4 text-gray-600" />
        </button>
      </div>

      {/* Center spheres */}
      <div className="flex items-center gap-8">
        {/* Group Chat Sphere */}
        <button
          onClick={handleChatClick}
          disabled={!currentGroupChatId}
          className={`
            flex items-center justify-center w-14 h-14 rounded-full 
            transition-all duration-200 shadow-lg
            ${currentGroupChatId 
              ? 'bg-indigo-600 hover:bg-indigo-700 hover:scale-105 cursor-pointer' 
              : 'bg-gray-300 cursor-not-allowed'
            }
          `}
          title={currentGroupChatId ? 'Go to Group Chat' : 'No active group chat'}
        >
          <MessageCircle className="h-7 w-7 text-white" />
        </button>

        {/* People/Placeholder Sphere */}
        <button
          onClick={handleSurveyClick}
          className="
            flex items-center justify-center w-14 h-14 rounded-full 
            bg-emerald-600 hover:bg-emerald-700 hover:scale-105
            transition-all duration-200 shadow-lg cursor-pointer
          "
          title="People (coming soon)"
        >
          <Users className="h-7 w-7 text-white" />
        </button>
      </div>

      {/* Empty div for balance */}
      <div className="w-24" />
    </div>
  )
}

export default UserNavigation

