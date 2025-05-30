'use client'

import { FC, useState } from 'react'
import Button from './ui/Button'
import { useForm } from 'react-hook-form'
import axios from 'axios'
import { useRouter } from 'next/navigation'

interface CreateGroupChatButtonProps {
  friends: User[]
}

interface FormData {
  name: string
  members: string[]
}

const CreateGroupChatButton: FC<CreateGroupChatButtonProps> = ({ friends }) => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedFriends, setSelectedFriends] = useState<string[]>([])
  const router = useRouter()

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm<FormData>()

  const onSubmit = async (data: FormData) => {
    try {
      const response = await axios.post('/api/group-chat/create', {
        name: data.name,
        memberIds: selectedFriends
      })

      setIsModalOpen(false)
      reset()
      setSelectedFriends([])
      
      // Navigate to the new group chat
      router.push(`/dashboard/chat/${response.data.id}`)
      router.refresh()
    } catch (error) {
      console.error('Failed to create group chat:', error)
    }
  }

  const toggleFriendSelection = (friendId: string) => {
    setSelectedFriends(prev => 
      prev.includes(friendId)
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId]
    )
  }

  return (
    <div>
      <Button onClick={() => setIsModalOpen(true)}>
        Create Group Chat
      </Button>

      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
            <h2 className="text-2xl font-bold mb-4">Create Group Chat</h2>
            
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">
                  Group Name
                </label>
                <input
                  {...register('name', { required: true })}
                  className="w-full p-2 border rounded"
                  placeholder="Enter group name"
                />
                {errors.name && (
                  <span className="text-red-500 text-sm">Name is required</span>
                )}
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">
                  Select Members
                </label>
                <div className="max-h-48 overflow-y-auto">
                  {friends.map(friend => (
                    <div
                      key={friend.id}
                      className="flex items-center p-2 hover:bg-gray-100 cursor-pointer"
                      onClick={() => toggleFriendSelection(friend.id)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedFriends.includes(friend.id)}
                        onChange={() => {}}
                        className="mr-2"
                      />
                      <span>{friend.name || friend.email}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={selectedFriends.length === 0}
                >
                  Create
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default CreateGroupChatButton 