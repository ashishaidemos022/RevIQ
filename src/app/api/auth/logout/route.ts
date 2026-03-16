import { NextRequest, NextResponse } from 'next/server';
import { getSession, destroySession } from '@/lib/auth/session';
import { logAuthEvent, extractRequestMeta } from '@/lib/auth/auth-log';

export async function POST(request: NextRequest) {
  const session = await getSession();
  const reqMeta = extractRequestMeta(request);

  await destroySession();

  if (session) {
    await logAuthEvent({
      event_type: 'logout',
      auth_method: 'saml',
      user_id: session.user_id,
      email: session.email,
      ...reqMeta,
    });
  }

  return NextResponse.json({ success: true, redirect: '/login' });
}
