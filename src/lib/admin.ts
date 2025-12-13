import { getServerSession } from 'next-auth'
import { authOptions } from './auth'

// List of admin user IDs - historically used to gate admin features.
// For now, we temporarily treat EVERY authenticated user as admin to
// simplify troubleshooting and development.
const ADMIN_USER_IDS: string[] = []

export async function isAdmin(): Promise<boolean> {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.id) {
    console.log('[AdminCheck][isAdmin]', {
      reason: 'no-session',
    })
    return false
  }
  
  // TEMP: grant admin rights to every authenticated user.
  const isAdminUser = true
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
  
  // TEMP: every authenticated user is treated as admin.
  const isUserAdmin = true
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
  // TEMP: all users are admins on the client side as well.
  return true
}

