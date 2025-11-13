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

    // Get all keys to see what's actually in Redis
    const allKeys = await db.keys('*')
    
    // Categorize keys
    const userKeys = allKeys.filter(key => key.includes('user'))
    const accountKeys = allKeys.filter(key => key.includes('account'))
    const sessionKeys = allKeys.filter(key => key.includes('session'))
    const otherKeys = allKeys.filter(key => !key.includes('user') && !key.includes('account') && !key.includes('session'))

    return NextResponse.json({
      totalKeys: allKeys.length,
      allKeys: allKeys.slice(0, 50), // Limit to first 50 keys
      userKeys: userKeys.slice(0, 20),
      accountKeys: accountKeys.slice(0, 20),
      sessionKeys: sessionKeys.slice(0, 20),
      otherKeys: otherKeys.slice(0, 20)
    })

  } catch (error) {
    console.error('Error fetching Redis keys:', error)
    return NextResponse.json(
      { error: 'Failed to fetch Redis keys' },
      { status: 500 }
    )
  }
}

