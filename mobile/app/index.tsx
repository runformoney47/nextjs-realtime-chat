import { useEffect, useState } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { bootstrapSession } from '@/lib/post-login'

/**
 * Entry point — validate stored JWT, then route to login / onboarding / chat.
 */
export default function Index() {
  const [bootstrapping, setBootstrapping] = useState(true)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const dest = await bootstrapSession()
      if (cancelled) return

      switch (dest) {
        case 'login':
          router.replace('/(auth)/login')
          break
        case 'onboarding':
          router.replace('/(auth)/onboarding')
          break
        case 'chat':
          router.replace('/(tabs)/chat')
          break
      }
      setBootstrapping(false)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  if (bootstrapping) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    )
  }

  return null
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
})
