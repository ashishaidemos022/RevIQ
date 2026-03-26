import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, handleAuthError } from '@/lib/auth/middleware';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    // Usage page will be wired to usage_billing_summary table
    // once UI requirements are defined. For now, return empty data.
    return NextResponse.json({
      data: [],
      product_types: [],
      total: 0,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
