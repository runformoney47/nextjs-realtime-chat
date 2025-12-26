import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Option A: Hosted URL
 * - Replace the URL below with your Vercel deployment.
 * - Keep it HTTPS for real devices.
 */
const config: CapacitorConfig = {
  appId: 'com.friendzone.shell',
  appName: 'FriendZone',
  webDir: 'noop',
  bundledWebRuntime: false,
  server: {
    // TODO: set this to your deployed URL, e.g. https://your-app.vercel.app
    url: 'https://example.com',
    cleartext: false,
  },
}

export default config


