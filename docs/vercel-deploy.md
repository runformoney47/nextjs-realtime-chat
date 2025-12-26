# Vercel deployment (Option A for iOS Shell)

This project is a Next.js (App Router) app that uses:
- NextAuth (Google + `sim-user` credentials)
- Upstash Redis REST (for db + NextAuth adapter)
- Pusher (realtime)

## 1) Deploy to Vercel

### Create the project
- Import the GitHub repo into Vercel
- Framework preset: **Next.js**
- Build command: `next build`
- Output: default

### Required environment variables (Vercel Project → Settings → Environment Variables)

**Auth**
- `NEXTAUTH_SECRET`: random string
- `NEXTAUTH_URL`: **your Vercel URL**, e.g. `https://your-app.vercel.app`

**Upstash Redis**
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

**Pusher**
- `PUSHER_APP_ID`
- `PUSHER_SECRET`
- `NEXT_PUBLIC_PUSHER_APP_KEY`
- `NEXT_PUBLIC_PUSHER_APP_CLUSTER`

**Google OAuth (if you plan to use Google login in the shell app)**
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

## 2) Google OAuth callback URLs (only if using Google login)

In Google Cloud Console → OAuth client:
- Authorized JavaScript origins:
  - `https://your-app.vercel.app`
- Authorized redirect URIs:
  - `https://your-app.vercel.app/api/auth/callback/google`

> For Vercel Preview deployments (per-PR URLs), Google OAuth is annoying unless you use a stable domain.
> For demos/studies, the simplest is to use the built-in `sim-user` login flow.

## 3) Quick sanity check after deploy
- Visit `https://your-app.vercel.app/login`
- Sign in via **sim-user** and confirm it loads `/dashboard/chat/<groupId>`
- Confirm chat realtime works (Pusher)


