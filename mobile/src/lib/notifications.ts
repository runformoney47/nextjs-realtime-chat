import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { api } from './api'

/**
 * Request push notification permissions and register the device token
 * with our backend.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Check/request permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') {
    console.log('[Notifications] Permission not granted')
    return null
  }

  // Get the Expo push token (works with APNs under the hood)
  const tokenData = await Notifications.getExpoPushTokenAsync()
  const token = tokenData.data

  // Register with our backend
  await api.post('/push/register', {
    token,
    platform: Platform.OS as 'ios' | 'android',
  })

  return token
}

/**
 * Configure how notifications appear when the app is in the foreground.
 */
export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  })
}


