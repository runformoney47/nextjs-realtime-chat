import { useEffect, useRef } from 'react'
import PusherClient from 'pusher-js'
import { getPusherConfig } from './config'

let pusherInstance: PusherClient | null = null

function getPusher(): PusherClient {
  const { key, cluster } = getPusherConfig()

  if (!pusherInstance) {
    pusherInstance = new PusherClient(key, {
      cluster,
      enabledTransports: ['ws', 'wss'],
    })
  }

  return pusherInstance
}

/**
 * React hook to subscribe to a Pusher channel and bind an event handler.
 *
 * Subscribes when `channelName` is non-null; unsubscribes on unmount or when
 * the channel changes (e.g. leaving a chat screen).
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

    const { key } = getPusherConfig()
    if (!key) {
      console.warn('[Pusher] Missing EXPO_PUBLIC_PUSHER_APP_KEY — realtime disabled')
      return
    }

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

/** Disconnect Pusher entirely (e.g. on logout). */
export function disconnectPusher() {
  if (pusherInstance) {
    pusherInstance.disconnect()
    pusherInstance = null
  }
}
