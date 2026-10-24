/**
 * Expo config — loads EXPO_PUBLIC_* from mobile/.env (and optional repo-root .env).
 *
 * At build/start time these values are baked into Constants.expoConfig.extra
 * so native code can read Pusher + production API URL without hardcoding secrets.
 */
const path = require('path')

try {
  require('dotenv').config({ path: path.resolve(__dirname, '.env') })
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
} catch {
  // dotenv optional until installed
}

/** @type {import('expo/config').ExpoConfig} */
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    pusherKey: process.env.EXPO_PUBLIC_PUSHER_APP_KEY,
    pusherCluster: process.env.EXPO_PUBLIC_PUSHER_CLUSTER ?? 'us2',
  },
})
