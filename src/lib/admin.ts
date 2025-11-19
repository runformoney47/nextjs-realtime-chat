import { getServerSession } from 'next-auth'
import { authOptions } from './auth'

// List of admin user IDs - you can add more here
const ADMIN_USER_IDS = [
  '1b5ddea5-2d52-4125-934f-24e3ccaea908', // Replace with your actual user ID
  // Add more admin user IDs as needed
]

export async function isAdmin(): Promise<boolean> {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.id) {
    console.log('[AdminCheck][isAdmin]', {
      reason: 'no-session',
    })
    return false
  }
  
  const isAdminUser = ADMIN_USER_IDS.includes(session.user.id)
  console.log('[AdminCheck][isAdmin]', {
    sessionUserId: session.user.id,
    isAdmin: isAdminUser,
  })
  return isAdminUser
}

export async function getAdminSession() {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.id) {
    console.log('[AdminCheck][getAdminSession]', {
      reason: 'no-session',
    })
    return null
  }
  
  const isUserAdmin = ADMIN_USER_IDS.includes(session.user.id)
  console.log('[AdminCheck][getAdminSession]', {
    sessionUserId: session.user.id,
    isAdmin: isUserAdmin,
  })
  
  return {
    ...session,
    user: {
      ...session.user,
      isAdmin: isUserAdmin
    }
  }
}

export function isAdminClient(userId: string): boolean {
  return ADMIN_USER_IDS.includes(userId)
}

