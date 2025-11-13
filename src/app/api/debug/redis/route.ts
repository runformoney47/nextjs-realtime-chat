import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    // Test basic Redis connection
    await db.set('test-key', 'test-value')
    const result = await db.get('test-key')
    await db.del('test-key')
    
    return NextResponse.json({ 
      success: true, 
      message: 'Redis connection successful',
      testResult: result 
    })
  } catch (error) {
    console.error('Redis connection error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error
    }, { status: 500 })
  }
}

