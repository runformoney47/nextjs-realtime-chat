'use client'

import { FC, useState, useEffect } from 'react'
import { XIcon } from 'lucide-react'
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd'
import { toast } from 'react-hot-toast'

interface UserRankingSidebarProps {
  isOpen: boolean
  onClose: () => void
  chatId: string
  userColors: Record<string, string>
  currentUserId: string
}

// Define a type for our rankable user
interface RankableUser {
  id: string
  color: string
  position: number
}

const UserRankingSidebar: FC<UserRankingSidebarProps> = ({
  isOpen,
  onClose,
  chatId,
  userColors,
  currentUserId
}) => {
  const [users, setUsers] = useState<RankableUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Color mapping for the user colors
  const colorMap = {
    Green: '#4CAF50',
    Yellow: '#FFEB3B',
    Orange: '#FF9800',
    Red: '#F44336',
    Violet: '#9C27B0'
  }

  // Load users and existing rankings from the backend
  useEffect(() => {
    const loadUsersAndRankings = async () => {
      if (!isOpen || !chatId) return
      
      setIsLoading(true)
      try {
        // First, convert userColors object to an array of rankable users
        // Filter out the current user
        const rankableUsers = Object.entries(userColors)
          .filter(([userId]) => userId !== currentUserId)
          .map(([userId, color], index) => ({
            id: userId,
            color,
            position: index
          }))
        
        // Now try to fetch any existing rankings from the backend
        const response = await fetch(`/api/rankings/${chatId}`)
        if (response.ok) {
          const data = await response.json()
          
          if (data.rankings && data.rankings.length > 0) {
            // Create a map of userId to position from the rankings
            const positionMap = new Map(
              data.rankings.map((ranking: { userId: string, position: number }) => [
                ranking.userId, 
                ranking.position
              ])
            )
            
            // Apply the positions from the backend to our rankable users
            const usersWithRankings = rankableUsers.map(user => ({
              ...user,
              position: positionMap.has(user.id) ? positionMap.get(user.id) as number : user.position
            }))
            
            // Sort by position
            usersWithRankings.sort((a, b) => a.position - b.position)
            
            setUsers(usersWithRankings)
          } else {
            setUsers(rankableUsers)
          }
        } else {
          // If we can't fetch rankings, just use the default order
          setUsers(rankableUsers)
        }
      } catch (error) {
        console.error('Failed to load users or rankings:', error)
        toast.error('Failed to load user rankings')
      } finally {
        setIsLoading(false)
      }
    }

    loadUsersAndRankings()
  }, [isOpen, chatId, userColors, currentUserId])

  // Handle drag end event
  const handleDragEnd = async (result: any) => {
    // Dropped outside the list
    if (!result.destination) {
      return
    }

    // Reorder the users array
    const reorderedUsers = Array.from(users)
    const [removed] = reorderedUsers.splice(result.source.index, 1)
    reorderedUsers.splice(result.destination.index, 0, removed)

    // Update the position property for each user
    const updatedUsers = reorderedUsers.map((user, index) => ({
      ...user,
      position: index
    }))

    setUsers(updatedUsers)

    // Save the updated rankings to the backend
    setIsSaving(true)
    try {
      const response = await fetch('/api/rankings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatId,
          rankings: updatedUsers.map(user => ({
            userId: user.id,
            position: user.position
          }))
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save rankings')
      }

      // Show success toast
      toast.success('Rankings saved')
    } catch (error) {
      console.error('Failed to save rankings:', error)
      toast.error('Failed to save rankings')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-y-0 right-0 w-64 bg-white shadow-lg border-l border-gray-200 z-10 transition-transform transform ease-in-out duration-300">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center">
        <h2 className="font-semibold text-lg">Rank Users</h2>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
          <XIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="p-4">
        <p className="text-sm text-gray-600 mb-4">
          Drag to rank users in this group chat:
        </p>

        {isLoading ? (
          <div className="flex justify-center p-4">
            <div className="loader h-6 w-6 border-2 border-t-indigo-600 border-gray-200 rounded-full animate-spin"></div>
          </div>
        ) : users.length === 0 ? (
          <p className="text-sm text-gray-500">No other users in this chat.</p>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="user-rankings">
              {(provided) => (
                <ul
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="space-y-2"
                >
                  {users.map((user, index) => (
                    <Draggable key={user.id} draggableId={user.id} index={index}>
                      {(provided) => (
                        <li
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className="p-3 bg-gray-50 rounded-md shadow-sm flex items-center cursor-grab"
                        >
                          <div 
                            className="w-6 h-6 rounded-full mr-3"
                            style={{ 
                              backgroundColor: colorMap[user.color as keyof typeof colorMap] || '#cccccc'
                            }}
                          />
                          <span>{user.color}</span>
                          <span className="ml-auto text-gray-400">#{index + 1}</span>
                        </li>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </ul>
              )}
            </Droppable>
          </DragDropContext>
        )}

        {isSaving && (
          <div className="mt-4 flex items-center justify-center text-sm text-gray-500">
            <div className="loader h-4 w-4 border-2 border-t-indigo-600 border-gray-200 rounded-full animate-spin mr-2"></div>
            Saving...
          </div>
        )}
      </div>
    </div>
  )
}

export default UserRankingSidebar 