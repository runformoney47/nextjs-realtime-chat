import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import type { ApiResponse } from '@groupchat/shared'
import { getConfiguredApiBase } from './config'

const DEV_API_PORT = 3001
/** Abort hung requests so seed/login show a spinner before failing (café Wi‑Fi, wrong host, etc.) */
const REQUEST_TIMEOUT_MS = 30_000

function isExpoTunnelHost(host: string): boolean {
  const h = host.toLowerCase()
  return (
    h.includes('exp.direct') ||
    h.includes('expo.dev') ||
    h.endsWith('.exp.host') ||
    h.includes('ngrok') ||
    h.includes('trycloudflare.com')
  )
}

function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1'
}

function isPrivateLanHost(host: string): boolean {
  return /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
}

function getExpoDebuggerHost(): string | null {
  try {
    const debuggerHost =
      Constants.expoConfig?.hostUri ??
      (Constants as unknown as { manifest?: { debuggerHost?: string } }).manifest
        ?.debuggerHost ??
      (
        Constants as unknown as {
          manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } }
        }
      ).manifest2?.extra?.expoGo?.debuggerHost

    if (!debuggerHost) return null
    return debuggerHost.split(':')[0]
  } catch {
    return null
  }
}

let loggedApiBase: string | null = null

/**
 * Resolve API base URL.
 *
 * **Dev priority:**
 * 1. `EXPO_PUBLIC_API_URL` in mobile/.env (required for most physical devices)
 * 2. Expo debugger private LAN IP → :3001
 * 3. localhost (simulator only)
 */
export function getApiBase(): string {
  const configured = getConfiguredApiBase()
  if (configured) {
    logApiBaseOnce(configured, 'EXPO_PUBLIC_API_URL')
    return configured
  }

  if (!__DEV__) {
    console.error('[API] EXPO_PUBLIC_API_URL is not set for production')
    return 'https://your-production-url.vercel.app/api'
  }

  const host = getExpoDebuggerHost()

  if (host && !isExpoTunnelHost(host) && !isLoopbackHost(host) && isPrivateLanHost(host)) {
    const base = `http://${host}:${DEV_API_PORT}/api`
    logApiBaseOnce(base, 'Expo LAN host')
    return base
  }

  if (host) {
    console.warn(
      `[API] Cannot use Expo host "${host}" for API. ` +
        'Set EXPO_PUBLIC_API_URL=http://<mac-lan-ip>:3001/api in mobile/.env',
    )
  }

  const fallback = `http://localhost:${DEV_API_PORT}/api`
  logApiBaseOnce(
    fallback,
    Platform.OS === 'web' ? 'web' : 'localhost (simulator only on native)',
  )
  return fallback
}

function logApiBaseOnce(base: string, source: string) {
  if (loggedApiBase === base) return
  loggedApiBase = base
  console.log(`[API] Base URL (${source}): ${base}`)
}

let onUnauthorizedHandler: (() => void) | null = null

/** Called when a request with a Bearer token receives 401 (expired/invalid JWT). */
export function setOnUnauthorized(handler: () => void) {
  onUnauthorizedHandler = handler
}

export function getApiNetworkHelpMessage(): string {
  return (
    `Trying: ${getApiBase()}\n\n` +
    '1. Run API server: npm run dev:server\n' +
    '2. mobile/.env: EXPO_PUBLIC_API_URL=http://<mac-ip>:3001/api\n' +
    '   Find IP: ipconfig getifaddr en0\n' +
    '3. Phone Safari: open that URL + /health\n' +
    '4. Same network or phone hotspot (café Wi‑Fi often blocks device-to-device)\n' +
    '5. Restart Expo after .env changes: npx expo start -c'
  )
}

class ApiClient {
  private async getToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync('auth_token')
    } catch {
      return null
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<ApiResponse<T>> {
    const token = await this.getToken()
    const url = `${getApiBase()}${path}`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })

      const data = (await response.json()) as ApiResponse<T>

      if (response.status === 401 && token) {
        onUnauthorizedHandler?.()
        return {
          ok: false,
          error: 'Session expired',
          code: 'UNAUTHORIZED',
        } as ApiResponse<T>
      }

      return data
    } catch (error) {
      const isAbort = error instanceof Error && error.name === 'AbortError'
      console.error(
        `[API] ${method} ${path} failed → ${url}`,
        isAbort ? '(timed out after 30s)' : error,
      )
      return {
        ok: false,
        error: isAbort ? 'Request timed out' : 'Network error',
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  async get<T = unknown>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path)
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, body)
  }

  async put<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', path, body)
  }

  async delete<T = unknown>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path)
  }

  /** Dev helper — quick connectivity check without side effects. */
  async pingHealth(): Promise<boolean> {
    const res = await this.get<{ ok: boolean }>('/health')
    return res.ok
  }
}

export const api = new ApiClient()
