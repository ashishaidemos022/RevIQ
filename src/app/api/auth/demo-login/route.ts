import { NextRequest, NextResponse } from 'next/server';
import { createSession } from '@/lib/auth/session';
import { isDemoMode, DEMO_PERSONAS } from '@/lib/demo';

/**
 * Demo login endpoint — only active when DEMO_MODE=true.
 * No password required; the caller picks a persona by userId.
 * Returns HTTP 404 in any non-demo environment so the route
 * effectively does not exist in production.
 */
export async function POST(request: NextRequest) {
  if (!isDemoMode()) {
    return new NextResponse(null, { status: 404 });
  }

  let body: { userId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { userId } = body;
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const persona = DEMO_PERSONAS.find(p => p.userId === userId);
  if (!persona) {
    return NextResponse.json({ error: 'Unknown demo persona' }, { status: 400 });
  }

  await createSession({
    user_id: persona.userId,
    role: persona.role as import('@/types/database').UserRole,
    email: persona.email,
    full_name: persona.fullName,
  });

  return NextResponse.json({ success: true, redirect: '/home' });
}
