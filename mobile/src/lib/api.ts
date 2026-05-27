import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'
import type { ApiResponse } from '@groupchat/shared'

/**
 * Base URL for the API server.
 *
 * On a physical device, localhost doesn't work — we need the laptop's LAN IP.
 * Expo gives us the dev server's host via Constants.expoConfig, which we can
 * reuse to derive the API server address (same machine, different port).
 *
 * In production, this should point to your Vercel deployment.
 */
function getApiBase(): string {
  if (!__DEV__) {
    return 'https://your-production-url.vercel.app/api'
  }

  // In dev, derive the API URL from Expo's dev server host.
  // Expo runs on port 8081, our API runs on port 3001 — same machine.
  try {
    const debuggerHost =
      Constants.expoConfig?.hostUri ?? // Expo SDK 52+
      (Constants as any).manifest?.debuggerHost ??
      (Constants as any).manifest2?.extra?.expoGo?.debuggerHost

    if (debuggerHost) {
      const host = debuggerHost.split(':')[0] // strip the port
      return `http://${host}:3001/api`
    }
  } catch {}

  // Fallback for simulator (localhost works there)
  return 'http://localhost:3001/api'
}

const API_BASE = getApiBase()

/**
 * Thin HTTP client that auto-attaches the Bearer token
 * and returns typed ApiResponse objects.
 */
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
    const url = `${API_BASE}${path}`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      })

      const data = await response.json()
      return data as ApiResponse<T>
    } catch (error) {
      console.error(`[API] ${method} ${path} failed:`, error)
      return { ok: false, error: 'Network error' }
    }
  }

  async get<T = any>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path)
  }

  async post<T = any>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, body)
  }

  async put<T = any>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', path, body)
  }

  async delete<T = any>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path)
  }
}

export const api = new ApiClient()

