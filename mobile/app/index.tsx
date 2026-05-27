import { useEffect } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'

/**
 * Entry point — shows a loading spinner while checking auth state,
 * then redirects to login or the main tabs.
 */
export default function Index() {
  const { token, isLoading, loadToken } = useAuthStore()

  useEffect(() => {
    loadToken()
  }, [])

  useEffect(() => {
    if (isLoading) return

    if (token) {
      router.replace('/(tabs)/chat')
    } else {
      router.replace('/(auth)/login')
    }
  }, [token, isLoading])

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#4F46E5" />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
})


