import { useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native'
import * as AppleAuthentication from 'expo-apple-authentication'
import { router } from 'expo-router'
import { isAppleSignInAvailable, signInWithApple } from '@/lib/apple-auth'
import { getApiBase } from '@/lib/api'

export default function LoginScreen() {
  const [appleAvailable, setAppleAvailable] = useState(false)
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    isAppleSignInAvailable().then(setAppleAvailable)
  }, [])

  const handleAppleSignIn = async () => {
    setSigningIn(true)
    const result = await signInWithApple()
    setSigningIn(false)

    if (!result.ok && result.error !== 'cancelled') {
      Alert.alert('Sign in failed', result.error)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.emoji}>💬</Text>
        <Text style={styles.title}>LunchTable</Text>
        <Text style={styles.tagline}>
          Curated group chats twice a week.{'\n'}Meet new people, no pressure.
        </Text>
      </View>

      <View style={styles.actions}>
        {signingIn ? (
          <ActivityIndicator size="large" color="#4F46E5" />
        ) : appleAvailable ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={12}
            style={styles.appleButton}
            onPress={() => {
              void handleAppleSignIn()
            }}
          />
        ) : (
          <View style={styles.unavailableBox}>
            <Text style={styles.unavailableTitle}>Apple Sign-In unavailable</Text>
            <Text style={styles.unavailableText}>
              Use a physical iPhone with iOS 13+, or open Developer Login below.
            </Text>
          </View>
        )}

        {__DEV__ && (
          <TouchableOpacity
            style={styles.devLink}
            onPress={() => router.push('/(auth)/dev-login')}
          >
            <Text style={styles.devLinkText}>Developer login →</Text>
          </TouchableOpacity>
        )}
      </View>

      {__DEV__ && (
        <Text style={styles.apiHint} selectable>
          API: {getApiBase()}
        </Text>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'space-between',
    paddingBottom: 32,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emoji: { fontSize: 72, marginBottom: 16 },
  title: { fontSize: 36, fontWeight: '800', color: '#4F46E5' },
  tagline: {
    fontSize: 17,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 26,
    marginTop: 12,
  },
  actions: {
    paddingHorizontal: 24,
    gap: 16,
    minHeight: 120,
    justifyContent: 'center',
  },
  appleButton: {
    width: '100%',
    height: 52,
  },
  unavailableBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  unavailableTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  unavailableText: { fontSize: 14, color: '#6B7280', lineHeight: 20 },
  devLink: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  devLinkText: { fontSize: 15, fontWeight: '600', color: '#4F46E5' },
  apiHint: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingHorizontal: 24,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
})
