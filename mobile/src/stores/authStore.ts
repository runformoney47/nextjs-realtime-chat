import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import type { AppUser } from '@groupchat/shared'
import { disconnectPusher } from '@/lib/pusher'

interface AuthState {
  token: string | null
  user: AppUser | null
  isLoading: boolean

  /** Load stored token on app start. */
  loadToken: () => Promise<void>

  /** Set auth state after login. */
  setAuth: (token: string, user: AppUser) => Promise<void>

  /** Clear auth state and remove stored token. */
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isLoading: true,

  loadToken: async () => {
    try {
      const token = await SecureStore.getItemAsync('auth_token')
      const userJson = await SecureStore.getItemAsync('auth_user')
      const user = userJson ? (JSON.parse(userJson) as AppUser) : null

      set({ token, user, isLoading: false })
    } catch {
      set({ token: null, user: null, isLoading: false })
    }
  },

  setAuth: async (token: string, user: AppUser) => {
    await SecureStore.setItemAsync('auth_token', token)
    await SecureStore.setItemAsync('auth_user', JSON.stringify(user))
    set({ token, user })
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('auth_token')
    await SecureStore.deleteItemAsync('auth_user')
    disconnectPusher()
    set({ token: null, user: null })
  },
}))


