import { useEffect } from 'react'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { configureNotificationHandler } from '@/lib/notifications'
import { setOnUnauthorized } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'

export default function RootLayout() {
  useEffect(() => {
    configureNotificationHandler()

    setOnUnauthorized(() => {
      useAuthStore
        .getState()
        .logout()
        .then(() => router.replace('/(auth)/login'))
    })
  }, [])

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="chat/[id]"
          options={{
            headerShown: true,
            headerTitle: 'Group Chat',
            presentation: 'card',
          }}
        />
      </Stack>
    </>
  )
}
