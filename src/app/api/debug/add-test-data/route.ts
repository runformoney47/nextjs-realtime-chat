import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin'
import { db } from '@/lib/db'

export async function POST() {
  try {
    // Check if user is admin
    const adminCheck = await isAdmin()
    if (!adminCheck) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Add some test users
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
        createdAt: new Date().toISOString(),
        lastActive: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        isOnline: false
      },
      {
        id: 'test-user-3',
        name: 'Test User 3',
        email: 'test3@example.com',
        image: 'https://api.dicebear.com/7.x/avataaars/png?seed=3',
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        isOnline: true
      }
    ]

    // Store test users
    for (const user of testUsers) {
      await db.set(`user:${user.id}`, JSON.stringify(user))
    }

    // Add some test groups
    const testGroups = [
      {
        id: 'test-group-1',
        name: 'Test Group 1',
        description: 'A test group for demonstration',
        createdAt: new Date().toISOString(),
        isActive: true
      },
      {
        id: 'test-group-2',
        name: 'Test Group 2',
        description: 'Another test group',
        createdAt: new Date().toISOString(),
        isActive: true
      }
    ]

    // Store test groups
    for (const group of testGroups) {
      await db.set(`group:${group.id}`, JSON.stringify(group))
    }

    return NextResponse.json({
      success: true,
      message: 'Test data added successfully',
      usersAdded: testUsers.length,
      groupsAdded: testGroups.length
    })

  } catch (error) {
    console.error('Error adding test data:', error)
    return NextResponse.json(
      { error: 'Failed to add test data' },
      { status: 500 }
    )
  }
}

