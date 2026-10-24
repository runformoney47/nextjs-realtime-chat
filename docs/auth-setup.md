# Authentication setup

## Flow

```
App launch → bootstrapSession()
  ├─ no token        → /login
  ├─ invalid JWT     → logout → /login
  ├─ no quiz profile → /onboarding
  └─ quiz complete   → /(tabs)/chat

Apple Sign-In → POST /api/auth/login { provider: 'apple', identityToken }
  → server verifies JWT with Apple JWKS
  → completeLogin() → push register → routeAfterLogin()

Dev login (development only) → /dev-login → POST /api/dev/login-as
```

## Server env (`server/.env`)

```env
JWT_SECRET=your-secret
APPLE_BUNDLE_ID=com.groupchat.app   # must match mobile app.json ios.bundleIdentifier
```

Apple verification uses `https://appleid.apple.com/auth/keys` (no Apple API key required for identity token verification).

## Mobile

- **Production path:** Sign in with Apple on `login.tsx`
- **Dev path:** Developer login → seed + pick test user (uses same `completeLogin` + onboarding routing)

## Apple Sign-In requirements

- Physical **iPhone** with iOS 13+ (simulator support is limited)
- Bundle ID `com.groupchat.app` registered in Apple Developer portal with Sign in with Apple capability
- For **TestFlight/App Store builds**, use EAS Build (Expo Go uses Expo's provisioning for dev)

## Session expiry

JWT expires after 30 days. Any API call with an expired token returns 401 → auto logout → `/login`.
