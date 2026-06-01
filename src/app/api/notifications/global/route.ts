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

    // Parse request body defensively – logging/notifications should never crash
    let type: string | undefined
    let message: string | undefined
    try {
      if (req.headers.get('content-type')?.includes('application/json')) {
        // Clone the request before reading the body to avoid Undici #state issues
        const clone = req.clone()
        const body = (await clone.json()) as { type?: string; message?: string }
        type = body.type
        message = body.message
      }
    } catch {
      // Treat bad/empty JSON as "no extra data"
      type = undefined
      message = undefined
    }

    // If type is missing, just no-op with 204 – this is a dev convenience endpoint.
    if (!type) return new Response(null, { status: 204 })

    // Send the notification via Pusher
    await pusherServer.trigger('global_notifications', type, {
      message: message || 'System notification',
      timestamp: Date.now(),
      sender: {
        id: session.user.id,
        name: session.user.name || 'Admin'
      }
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Notification sent successfully',
      }),
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
  } catch (error) {
    console.error('Error sending global notification:', error)
    // Don’t propagate notification failures to the UI; just log them.
    return new Response(null, { status: 204 })
  }
} 