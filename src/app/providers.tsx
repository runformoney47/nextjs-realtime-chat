'use client'

import { FC, ReactNode, useEffect } from 'react'
import { pusherClient } from '@/lib/pusher'
import { toast } from 'react-hot-toast'

interface ProvidersProps {
  children: ReactNode
}

const Providers: FC<ProvidersProps> = ({ children }) => {
  useEffect(() => {
    // Add connection status handlers
    pusherClient.connection.bind('connected', () => {
      console.log('Connected to Pusher')
      toast.success('Real-time connection established')
    })

    pusherClient.connection.bind('disconnected', () => {
      console.log('Disconnected from Pusher')
      toast.error('Real-time connection lost')
    })

    pusherClient.connection.bind('error', (err: any) => {
      console.error('Pusher connection error:', err)
      toast.error('Real-time connection error')
    })

    // Debug event binding
    const debugChannel = pusherClient.subscribe('debug-channel')
    debugChannel.bind('pusher:subscription_succeeded', () => {
      console.log('Successfully subscribed to debug channel')
    })

    // Cleanup function
    return () => {
      pusherClient.connection.unbind_all()
      pusherClient.unsubscribe('debug-channel')
    }
  }, [])

  return <>{children}</>
}

export default Providers 