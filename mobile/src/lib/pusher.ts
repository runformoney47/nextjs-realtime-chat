import { useEffect, useRef } from 'react'
import PusherClient from 'pusher-js'

/** Pusher app key — must match the server's NEXT_PUBLIC_PUSHER_APP_KEY */
const PUSHER_KEY = 'YOUR_PUSHER_KEY' // TODO: Move to env/config
const PUSHER_CLUSTER = 'us2'

let pusherInstance: PusherClient | null = null

function getPusher(): PusherClient {
  if (!pusherInstance) {
    pusherInstance = new PusherClient(PUSHER_KEY, {
      cluster: PUSHER_CLUSTER,
    })
  }
  return pusherInstance
}

/**
 * React hook to subscribe to a Pusher channel and bind an event handler.
 *
 * Usage:
 * ```ts
 * usePusher('chat__group_abc123', 'incoming-message', (message) => {
 *   // handle new message
 * })
 * ```
 */
export function usePusher<T = unknown>(
  channelName: string | null,
  eventName: string,
  handler: (data: T) => void,
) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!channelName) return

    const pusher = getPusher()
    const channel = pusher.subscribe(channelName)

    const boundHandler = (data: T) => {
      handlerRef.current(data)
    }

    channel.bind(eventName, boundHandler)

    return () => {
      channel.unbind(eventName, boundHandler)
      pusher.unsubscribe(channelName)
    }
  }, [channelName, eventName])
}

/**
 * Disconnect Pusher entirely (e.g. on logout).
 */
export function disconnectPusher() {
  if (pusherInstance) {
    pusherInstance.disconnect()
    pusherInstance = null
  }
}


