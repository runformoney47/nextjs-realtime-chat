import { router } from 'expo-router'
import type { AppUser, LoginResponse, UserProfile } from '@groupchat/shared'
import { api } from './api'
import { useAuthStore } from '@/stores/authStore'
import { registerForPushNotifications } from './notifications'

/**
 * Persist session, register push token, route to onboarding or main app.
 */
export async function completeLogin(token: string, user: AppUser): Promise<void> {
  await useAuthStore.getState().setAuth(token, user)

  // Non-blocking — failures should not block login
  registerForPushNotifications().catch((err) => {
    console.warn('[post-login] Push registration failed:', err)
  })

  await routeAfterLogin()
}

export async function routeAfterLogin(): Promise<void> {
  const res = await api.get<UserProfile | null>('/profile/quiz')

  if (res.ok && res.data?.completedAt) {
    router.replace('/(tabs)/chat')
  } else {
    router.replace('/(auth)/onboarding')
  }
}

export type BootstrapDestination = 'login' | 'onboarding' | 'chat'

/**
 * Restore session on cold start: validate JWT, refresh user, decide route.
 */
export async function bootstrapSession(): Promise<BootstrapDestination> {
  const { loadToken, logout, setAuth, token: existingToken } = useAuthStore.getState()
  await loadToken()

  const token = useAuthStore.getState().token ?? existingToken
  if (!token) return 'login'

  const me = await api.get<AppUser>('/auth/me')
  if (!me.ok) {
    await logout()
    return 'login'
  }

  await setAuth(token, me.data)

  const quiz = await api.get<UserProfile | null>('/profile/quiz')
  if (quiz.ok && quiz.data?.completedAt) return 'chat'
  return 'onboarding'
}

/** Exchange Apple/dev credentials for our JWT. */
export async function loginWithProvider(
  body: Record<string, unknown>,
): Promise<{ ok: true; data: LoginResponse } | { ok: false; error: string }> {
  const res = await api.post<LoginResponse>('/auth/login', body)
  if (!res.ok) {
    return { ok: false, error: res.error ?? 'Login failed' }
  }
  return { ok: true, data: res.data }
}
