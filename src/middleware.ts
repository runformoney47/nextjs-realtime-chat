import { getToken } from 'next-auth/jwt'
import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

/**
 * This middleware runs BEFORE any route/page that matches `config.matcher`.
 *
 * It enforces:
 * - Unauthenticated users are redirected to /login when hitting /dashboard.
 * - Authenticated users are redirected away from /login to /dashboard.
 * - / redirects to /dashboard.
 *
 * Notes:
 * - `withAuth` adds NextAuth helpers (like `getToken`) into middleware.
 * - The `authorized` callback always returns true because we do all
 *   route guarding logic explicitly here (redirects), rather than
 *   letting withAuth block the request.
 */
export default withAuth(
  async function middleware(req) {
    const pathname = req.nextUrl.pathname
    
    // Check if the user has a valid NextAuth token (JWT session).
    const isAuth = await getToken({ req })
    const isLoginPage = pathname.startsWith('/login')

    // Any route under /dashboard is considered protected.
    const sensitiveRoutes = ['/dashboard']
    const isAccessingSensitiveRoute = sensitiveRoutes.some((route) =>
      pathname.startsWith(route)
    )

    // If user is already authenticated and tries to visit /login, send them to /dashboard.
    if (isLoginPage) {
      if (isAuth) {
        return NextResponse.redirect(new URL('/dashboard', req.url))
      }
      return NextResponse.next()
    }

    // If user is NOT authenticated and is trying to access /dashboard, send them to /login.
    if (!isAuth && isAccessingSensitiveRoute) {
      return NextResponse.redirect(new URL('/login', req.url))
    }

    // If user hits the site root (/), send them to /dashboard (either they’ll be authed and allowed,
    // or middleware will redirect them to /login on the next pass).
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }

    // Otherwise, allow the request to continue.
    return NextResponse.next()
  },
  {
    callbacks: {
      // We always return true here because we handle auth gating manually above.
      async authorized() {
        return true
      },
    },
  }
)

// Apply this middleware to:
// - /
// - /login
// - /dashboard and all subpaths
export const config = {
  matcher: ['/', '/login', '/dashboard/:path*'],
}
