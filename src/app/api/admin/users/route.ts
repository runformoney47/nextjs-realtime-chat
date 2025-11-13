import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin'
import { db } from '@/lib/db'

export async function GET() {
  try {
    // Check if user is admin
    const adminCheck = await isAdmin()
    if (!adminCheck) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Get all users
    const userKeys = await db.keys('user:*')
    const users = []

    for (const key of userKeys) {
      const userData = await db.get(key)
      if (userData) {
        const user = JSON.parse(userData as string)
        users.push({
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          createdAt: user.createdAt || new Date().toISOString(),
          lastActive: user.lastActive,
          isOnline: user.isOnline || false
        })
      }
    }

    // Sort by creation date (newest first)
    users.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return NextResponse.json(users)

  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    )
  }
}

