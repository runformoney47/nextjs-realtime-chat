// Minimal root layout — this server is API-only.
// Next.js requires a root layout even when there are no pages.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}


