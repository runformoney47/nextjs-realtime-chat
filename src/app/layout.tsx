import Providers from '@/components/Providers'
import './globals.css'

// Done after the video and optional: add page metadata
export const metadata = {
  title: 'FriendZone | Home',
  description: 'Welcome to the FriendZone',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang='en'>
      <head>
        {/* iOS / WKWebView: prevent auto-zoom + pinch-zoom and use safe areas */}
        <meta
          name='viewport'
          content='width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
