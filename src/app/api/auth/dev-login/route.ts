import { NextRequest, NextResponse } from 'next/server';
import { createSession } from '@/lib/auth/session';
import { timingSafeEqual } from 'crypto';

export async function POST(request: NextRequest) {
  // Production guard — return 404 (not 403) so route effectively doesn't exist
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.ENABLE_DEV_ADMIN !== 'true'
  ) {
    return new NextResponse(null, { status: 404 });
  }

  const devPassword = process.env.DEV_ADMIN_PASSWORD;
  if (!devPassword) {
    return NextResponse.json(
      { error: 'DEV_ADMIN_PASSWORD not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json({ error: 'Password required' }, { status: 400 });
    }

    // Timing-safe comparison
    const a = Buffer.from(password);
    const b = Buffer.from(devPassword);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    await createSession({
      user_id: 'dev-admin',
      role: 'revops_rw',
      email: 'admin@td.com',
      full_name: 'Dev Admin',
    });

    return NextResponse.json({ success: true, redirect: '/home' });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
