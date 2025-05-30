import { fetchRedis } from '@/helpers/redis'
import { authOptions } from '@/lib/auth'
import { getServerSession } from 'next-auth'

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return new Response('Unauthorized', { status: 401 })
    }

    // Try to get the last transition info from Redis
    let transitionData = null
    let error = null
    
    try {
      const lastTransitionRaw = await fetchRedis('get', 'last_group_chat_transition') as string | null
      
      if (lastTransitionRaw) {
        transitionData = JSON.parse(lastTransitionRaw)
      }
    } catch (fetchError) {
      console.error('Error fetching last transition data:', fetchError)
      error = 'Error fetching transition data'
    }

    return new Response(JSON.stringify({
      transition: transitionData,
      error
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0'
      }
    })
  } catch (error) {
    console.error('Error in last transition endpoint:', error)
    return new Response('Server error', { status: 500 })
  }
} 