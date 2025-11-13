import { getServerSession } from 'next-auth'
import { authOptions } from './auth'

// List of admin user IDs - you can add more here
const ADMIN_USER_IDS = [
  'abbd0386-9c72-411a-af14-cc70763b22a5', // Replace with your actual user ID
  // Add more admin user IDs as needed
]

export async function isAdmin(): Promise<boolean> {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.id) {
    return false
  }
  
  return ADMIN_USER_IDS.includes(session.user.id)
}

export async function getAdminSession() {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.id) {
    return null
  }
  
  const isUserAdmin = ADMIN_USER_IDS.includes(session.user.id)
  
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

