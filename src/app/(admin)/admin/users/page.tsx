import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import AdminUsersClient from './AdminUsersClient'

interface User {
  id: string
  name: string
  email: string
  image: string
  createdAt: string
  lastActive?: string
  isOnline?: boolean
}

async function getUsers(): Promise<User[]> {
  try {
    // Get actual user keys (not account keys)
    const allKeys = await db.keys('user:*')
    const userKeys = allKeys.filter(key => 
      key.startsWith('user:') && 
      !key.includes('account') && 
      !key.includes('email') &&
      key !== 'user:account:by-user-id:abbd0386-9c72-411a-af14-cc70763b22a5'
    )
    
    console.log('Fetching users from keys:', userKeys)
    const users = []

    for (const key of userKeys) {
      try {
        const userData = await db.get(key)
        if (userData) {
          console.log('Raw user data:', userData, 'Type:', typeof userData)
          
          let user
          if (typeof userData === 'string') {
            user = JSON.parse(userData)
          } else if (typeof userData === 'object') {
            user = userData
          } else {
            console.error(`Unexpected data type for user ${key}:`, typeof userData)
            continue
          }
          
          console.log('Parsed user data:', user)
          
          users.push({
            id: user.id,
            name: user.name || 'Unknown User',
            email: user.email || 'No email',
            image: user.image || user.picture || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default',
            createdAt: user.createdAt || user.created_at || new Date().toISOString(),
            lastActive: user.lastActive || user.last_active,
            isOnline: user.isOnline || false
          })
        }
      } catch (error) {
        console.error(`Error processing user ${key}:`, error)
      }
    }

    // Sort by creation date (newest first)
    users.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    console.log('Final users array:', users)
    return users
  } catch (error) {
    console.error('Error fetching users:', error)
    return []
  }
}

export default async function AdminUsers() {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    redirect('/login')
  }

  if (!session.user.isAdmin) {
    redirect('/dashboard')
  }

  const users = await getUsers()

  return <AdminUsersClient initialUsers={users} />
}
