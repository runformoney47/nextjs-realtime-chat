import { authOptions } from '@/lib/auth'
import { pusherServer } from '@/lib/pusher'
import { getServerSession } from 'next-auth'

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return new Response('Unauthorized', { status: 401 })
    }

    // Only allow admins to send global notifications
    // In a real app, you would check if the user has admin privileges
    const isAdmin = true // Placeholder for actual admin check

    if (!isAdmin) {
      return new Response('Unauthorized - Admin access required', { status: 403 })
    }

    // Parse request body
    const body = await req.json()
    const { type, message } = body

    if (!type) {
      return new Response('Missing notification type', { status: 400 })
    }

    // Send the notification via Pusher
    await pusherServer.trigger('global_notifications', type, {
      message: message || 'System notification',
      timestamp: Date.now(),
      sender: {
        id: session.user.id,
        name: session.user.name || 'Admin'
      }
    })

    return new Response(JSON.stringify({
      success: true,
      message: 'Notification sent successfully'
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    })
  } catch (error) {
    console.error('Error sending global notification:', error)
    return new Response('Server error', { status: 500 })
  }
} 