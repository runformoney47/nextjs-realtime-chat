import Constants from 'expo-constants'

/**
 * Runtime config injected via app.config.js `extra` from EXPO_PUBLIC_* env vars.
 * See mobile/.env.example.
 */
export type AppExtra = {
  apiUrl?: string
  pusherKey?: string
  pusherCluster?: string
}

export function getAppExtra(): AppExtra {
  return (Constants.expoConfig?.extra ?? {}) as AppExtra
}

export function getPusherConfig(): { key: string; cluster: string } {
  const { pusherKey, pusherCluster = 'us2' } = getAppExtra()

  if (__DEV__ && !pusherKey) {
    console.warn(
      '[config] EXPO_PUBLIC_PUSHER_APP_KEY is missing — set it in mobile/.env (same value as server NEXT_PUBLIC_PUSHER_APP_KEY)',
    )
  }

  return {
    key: pusherKey ?? '',
    cluster: pusherCluster,
  }
}

/**
 * API base from `EXPO_PUBLIC_API_URL` (used in dev and production).
 * e.g. http://192.168.1.10:3001/api
 */
export function getConfiguredApiBase(): string | null {
  const { apiUrl } = getAppExtra()
  if (!apiUrl?.trim()) return null
  const trimmed = apiUrl.trim().replace(/\/$/, '')
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`
}

/** @deprecated Use getConfiguredApiBase */
export const getProductionApiBase = getConfiguredApiBase
