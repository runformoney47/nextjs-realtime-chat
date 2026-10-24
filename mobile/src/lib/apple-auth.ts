import * as AppleAuthentication from 'expo-apple-authentication'
import { Platform } from 'react-native'
import { completeLogin, loginWithProvider } from './post-login'

export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false
  try {
    return await AppleAuthentication.isAvailableAsync()
  } catch {
    return false
  }
}

/**
 * Run native Apple Sign-In, verify on server, complete session.
 */
export async function signInWithApple(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    })

    if (!credential.identityToken) {
      return { ok: false, error: 'Apple did not return an identity token' }
    }

    const result = await loginWithProvider({
      provider: 'apple',
      identityToken: credential.identityToken,
      fullName: credential.fullName,
      email: credential.email,
    })

    if (!result.ok) {
      return result
    }

    await completeLogin(result.data.token, result.data.user)
    return { ok: true }
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ERR_REQUEST_CANCELED'
    ) {
      return { ok: false, error: 'cancelled' }
    }
    console.error('[apple-auth] Sign in failed:', error)
    return { ok: false, error: 'Apple Sign-In failed' }
  }
}
