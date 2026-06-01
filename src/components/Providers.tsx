'use client'
//what is this file?
//this file is for the providers
//providers are the components that wrap the app
//providers are used to provide the app with the necessary context
import { FC, ReactNode, useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
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
    })

    pusherClient.connection.bind('disconnected', () => {
      console.log('Disconnected from Pusher')
      toast.error('Real-time connection lost')
    })

    pusherClient.connection.bind('error', (err: any) => {
      console.error('Pusher connection error:', err)
      toast.error('Real-time connection error: ' + (err.message || 'Unknown error'))
    })

    // Cleanup function
    return () => {
      pusherClient.connection.unbind_all()
    }
  }, [])

  return (
    <>
      <Toaster position='top-center' reverseOrder={false} />
      {children}
    </>
  )
}

export default Providers
