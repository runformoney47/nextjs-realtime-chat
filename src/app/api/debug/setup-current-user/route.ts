import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { saveAppUser } from '@/lib/user-store'

export async function POST() {
  try {
    // Check if user is admin
    const adminCheck = await isAdmin()
    if (!adminCheck) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'No session found' }, { status: 401 })
    }

    // Create a proper user record for the current user
    const userRecord = {
      id: session.user.id,
      name: session.user.name || 'Admin User',
      email: session.user.email || 'admin@example.com',
      // Prefer PNG avatar to avoid Next.js SVG image warnings.
      image: session.user.image || 'https://api.dicebear.com/7.x/avataaars/png?seed=admin',
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      isOnline: true,
      isAdmin: true
    }

    // Store the user record and register it in the canonical user index
    await saveAppUser(
      {
        id: userRecord.id,
        name: userRecord.name,
        email: userRecord.email,
        image: userRecord.image,
        createdAt: userRecord.createdAt,
        lastActive: userRecord.lastActive,
        isOnline: userRecord.isOnline,
        isSimUser: false,
      },
      { source: 'debug-setup-current-user' },
    )

    // Add some additional test users
    const testUsers = [
      {
        id: 'test-user-1',
        name: 'Test User 1',
        email: 'test1@example.com',
        image: 'https://api.dicebear.com/7.x/avataaars/png?seed=1',
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        isOnline: true
      },
      {
        id: 'test-user-2',
        name: 'Test User 2',
        email: 'test2@example.com',
        image: 'https://api.dicebear.com/7.x/avataaars/png?seed=2',
        createdAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        lastActive: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        isOnline: false
      },
      {
        id: 'test-user-3',
        name: 'Test User 3',
        email: 'test3@example.com',
        image: 'https://api.dicebear.com/7.x/avataaars/png?seed=3',
        createdAt: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
        lastActive: new Date().toISOString(),
        isOnline: true
      }
    ]

    // Store test users and register them in the canonical user index
    for (const user of testUsers) {
      await saveAppUser(
        {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          createdAt: user.createdAt,
          lastActive: user.lastActive,
          isOnline: user.isOnline,
          isSimUser: true,
        },
        { source: 'debug-setup-current-user' },
      )
    }

    // Add some test groups
    const testGroups = [
      {
        id: 'test-group-1',
        name: 'General Chat',
        description: 'A general discussion group',
        createdAt: new Date().toISOString(),
        isActive: true
      },
      {
        id: 'test-group-2',
        name: 'Tech Talk',
        description: 'Discussion about technology',
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        isActive: true
      },
      {
        id: 'test-group-3',
        name: 'Random',
        description: 'Random discussions',
        createdAt: new Date(Date.now() - 172800000).toISOString(),
        isActive: false
      }
    ]

    // Store test groups
    for (const group of testGroups) {
      await db.set(`group:${group.id}`, JSON.stringify(group))
    }

    return NextResponse.json({
      success: true,
      message: 'Test data setup complete',
      currentUser: userRecord,
      testUsersAdded: testUsers.length,
      testGroupsAdded: testGroups.length
    })

  } catch (error) {
    console.error('Error setting up test data:', error)
    return NextResponse.json(
      { error: 'Failed to setup test data' },
      { status: 500 }
    )
  }
}

