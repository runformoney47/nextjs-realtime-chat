// API-only server. Redirect root to a health check or show a simple message.
export default function Home() {
  return (
    <div style={{ fontFamily: 'system-ui', padding: 40 }}>
      <h1>GroupChat API</h1>
      <p>This server provides the API for the GroupChat iOS app.</p>
      <p>
        <code>GET /api/health</code> — health check
      </p>
    </div>
  )
}


