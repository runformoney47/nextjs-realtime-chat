'use client'

import { FC, useState, useEffect } from 'react'
import { X } from 'lucide-react'
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
  const [isSavingRankings, setIsSavingRankings] = useState(false)
  const [isSavingRatings, setIsSavingRatings] = useState(false)
  const [ratings, setRatings] = useState<Record<string, number>>({})

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

        // Initialize 1-10 ratings (default midpoint = 5)
        setRatings(
          Object.fromEntries(rankableUsers.map((u) => [u.id, 5])) as Record<
            string,
            number
          >,
        )
        
        // Fetch existing order rankings + existing 1-10 peer ratings (best-effort)
        const [rankingsRes, peerRatingsRes] = await Promise.allSettled([
          fetch(`/api/rankings/${chatId}`),
          fetch(`/api/peer-ratings/${chatId}`),
        ])

        if (peerRatingsRes.status === 'fulfilled' && peerRatingsRes.value.ok) {
          try {
            const data = await peerRatingsRes.value.json()
            if (Array.isArray(data?.ratings)) {
              const incoming = Object.fromEntries(
                data.ratings
                  .filter(
                    (r: any) =>
                      r &&
                      typeof r.targetUserId === 'string' &&
                      typeof r.rating === 'number',
                  )
                  .map((r: any) => [r.targetUserId, r.rating]),
              ) as Record<string, number>

              setRatings((prev) => ({ ...prev, ...incoming }))
            }
          } catch (error) {
            console.warn('Failed to parse peer ratings:', error)
          }
        }

        if (rankingsRes.status === 'fulfilled' && rankingsRes.value.ok) {
          const data = await rankingsRes.value.json()
          
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

    // Save the updated rankings to the backend.
    // To avoid Undici/Next.js body stream issues, we send the payload
    // via query parameters instead of a JSON request body.
    setIsSavingRankings(true)
    try {
      const rankingsPayload = updatedUsers.map((user) => ({
        userId: user.id,
        position: user.position,
      }))

      const params = new URLSearchParams()
      params.set('rankings', JSON.stringify(rankingsPayload))

      const response = await fetch(`/api/rankings/${chatId}?${params.toString()}`, {
        method: 'POST',
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
      setIsSavingRankings(false)
    }
  }

  const handleSaveRatings = async () => {
    if (!chatId) return

    setIsSavingRatings(true)
    try {
      const ratingsPayload = users.map((u) => ({
        targetUserId: u.id,
        rating: Math.min(10, Math.max(1, Math.round(ratings[u.id] ?? 5))),
      }))

      const params = new URLSearchParams()
      params.set('ratings', JSON.stringify(ratingsPayload))

      const response = await fetch(`/api/peer-ratings/${chatId}?${params.toString()}`, {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error('Failed to save peer ratings')
      }

      toast.success('Ratings saved')
    } catch (error) {
      console.error('Failed to save peer ratings:', error)
      toast.error('Failed to save ratings')
    } finally {
      setIsSavingRatings(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-y-0 right-0 w-64 bg-white shadow-lg border-l border-gray-200 z-10 transition-transform transform ease-in-out duration-300">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center">
        <h2 className="font-semibold text-lg">Rank & Rate Users</h2>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="p-4">
        <p className="text-sm text-gray-600 mb-4">Drag to rank users in this group chat:</p>

        {isLoading ? (
          <div className="flex justify-center p-4">
            <div className="loader h-6 w-6 border-2 border-t-indigo-600 border-gray-200 rounded-full animate-spin"></div>
          </div>
        ) : users.length === 0 ? (
          <p className="text-sm text-gray-500">No other users in this chat.</p>
        ) : (
          <>
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
                                backgroundColor:
                                  colorMap[user.color as keyof typeof colorMap] || '#cccccc',
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

            <div className="my-4 border-t border-gray-200" />

            <p className="text-sm text-gray-600 mb-2">
              Rate each user from 1–10:
            </p>

            <ul className="space-y-3">
              {users.map((user) => {
                const value = ratings[user.id] ?? 5
                return (
                  <li key={`rating-${user.id}`} className="p-3 bg-gray-50 rounded-md shadow-sm">
                    <div className="flex items-center mb-2">
                      <div
                        className="w-5 h-5 rounded-full mr-2"
                        style={{
                          backgroundColor:
                            colorMap[user.color as keyof typeof colorMap] || '#cccccc',
                        }}
                      />
                      <span className="text-sm">{user.color}</span>
                      <span className="ml-auto text-sm text-gray-500">{value}</span>
                    </div>

                    <input
                      type="range"
                      min={1}
                      max={10}
                      step={1}
                      value={value}
                      onChange={(e) =>
                        setRatings((prev) => ({
                          ...prev,
                          [user.id]: Number(e.target.value),
                        }))
                      }
                      className="w-full"
                    />
                  </li>
                )
              })}
            </ul>

            <button
              onClick={handleSaveRatings}
              disabled={isSavingRatings}
              className="mt-3 w-full rounded-md bg-indigo-600 text-white py-2 text-sm disabled:opacity-60"
            >
              {isSavingRatings ? 'Saving ratings…' : 'Save Ratings'}
            </button>
          </>
        )}

        {isSavingRankings && (
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