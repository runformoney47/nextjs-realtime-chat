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
    url: process.env.CAPACITOR_SERVER_URL || 'https://example.com',
    cleartext: false,
    // Helpful during development if you navigate to other allowed URLs.
    // Keep this conservative for production.
    allowNavigation: ['*.vercel.app'],
  },
}

export default config


