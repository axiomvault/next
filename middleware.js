import { NextResponse } from 'next/server';

export const config = {
  matcher: '/dashboard', // Protects only the /dashboard route
};

export function middleware(req) {
  const basicAuth = req.headers.get('authorization');
  const url = req.nextUrl;

  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1];
    const [user, pwd] = atob(authValue).split(':');

    const validUser = process.env.DASHBOARD_USER;
    const validPassword = process.env.DASHBOARD_PASSWORD;

    if (user === validUser && pwd === validPassword) {
      return NextResponse.next();
    }
  }

  url.pathname = '/api/auth';
  return NextResponse.rewrite(url);
}