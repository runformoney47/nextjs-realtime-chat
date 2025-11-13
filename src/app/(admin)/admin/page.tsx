import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'

interface AdminStats {
  totalUsers: number
  totalGroups: number
  activeUsers: number
  messagesToday: number
}

async function getAdminStats(): Promise<AdminStats> {
  try {
    console.log('Fetching admin stats...')
    
    // Get actual user keys (not account keys)
    const allKeys = await db.keys('user:*')
    const userKeys = allKeys.filter(key => 
      key.startsWith('user:') && 
      !key.includes('account') && 
      !key.includes('email') &&
      key !== 'user:account:by-user-id:abbd0386-9c72-411a-af14-cc70763b22a5'
    )
    console.log('Actual user keys found:', userKeys)
    const totalUsers = userKeys.length

    // Get all groups
    const groupKeys = await db.keys('group:*')
    console.log('Group keys found:', groupKeys)
    const totalGroups = groupKeys.length

    // Get active users (users who have been active in the last 24 hours)
    let activeUsers = 0
    for (const key of userKeys) {
      try {
        const user = await db.get(key)
        if (user) {
          let userData
          if (typeof user === 'string') {
            userData = JSON.parse(user)
          } else if (typeof user === 'object') {
            userData = user
          } else {
            console.error(`Unexpected data type for user ${key}:`, typeof user)
            continue
          }
          
          if (userData.lastActive) {
            const lastActive = new Date(userData.lastActive)
            const now = new Date()
            const hoursDiff = (now.getTime() - lastActive.getTime()) / (1000 * 60 * 60)
            if (hoursDiff <= 24) {
              activeUsers++
            }
          } else {
            // If no lastActive, assume they're active if they exist
            activeUsers++
          }
        }
      } catch (error) {
        console.error(`Error processing user ${key}:`, error)
      }
    }

    // Get messages from today (this is a simplified count)
    const messageKeys = await db.keys('message:*')
    console.log('Message keys found:', messageKeys)
    const today = new Date().toDateString()
    let messagesToday = 0
    
    for (const key of messageKeys) {
      try {
        const message = await db.get(key)
        if (message) {
          const messageData = JSON.parse(message as string)
          if (messageData.timestamp) {
            const messageDate = new Date(messageData.timestamp).toDateString()
            if (messageDate === today) {
              messagesToday++
            }
          }
        }
      } catch (error) {
        console.error(`Error processing message ${key}:`, error)
      }
    }

    console.log('Admin stats:', { totalUsers, totalGroups, activeUsers, messagesToday })

    return {
      totalUsers,
      totalGroups,
      activeUsers,
      messagesToday
    }
  } catch (error) {
    console.error('Error fetching admin stats:', error)
    return {
      totalUsers: 0,
      totalGroups: 0,
      activeUsers: 0,
      messagesToday: 0
    }
  }
}

export default async function AdminDashboard() {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    redirect('/login')
  }

  if (!session.user.isAdmin) {
    redirect('/dashboard')
  }

  const stats = await getAdminStats()

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Admin Dashboard</h1>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                  </svg>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Total Users
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stats.totalUsers}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-500 rounded-md flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Total Groups
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stats.totalGroups}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-yellow-500 rounded-md flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Active Users
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stats.activeUsers}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-purple-500 rounded-md flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Messages Today
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stats.messagesToday}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
            View All Users
          </button>
          <button className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">
            Manage Groups
          </button>
          <button className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600">
            Start Simulation
          </button>
        </div>
      </div>
    </div>
  )
}
