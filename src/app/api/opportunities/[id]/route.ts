import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAuth, resolveViewAs, handleAuthError } from '@/lib/auth/middleware';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const viewAsUser = await resolveViewAs(request, user);
    const db = getSupabaseClient();
    const { id } = await params;

    // Fetch the opportunity with related data
    const { data: opp, error } = await db
      .from('opportunities')
      .select('*, accounts(id, name, industry, region), users!opportunities_owner_user_id_fkey(id, full_name, email)')
      .eq('id', id)
      .single();

    if (error || !opp) {
      return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });
    }

    // For PBM roles, also include credit info
    const targetUser = viewAsUser ?? user;
    let creditInfo = null;

    if (targetUser.role === 'pbm') {
      const { resolvePbmCreditedOpps, getPbmSfIdMap } = await import('@/lib/pbm/resolve-credited-opps');
      const pbmSfIdMap = await getPbmSfIdMap([targetUser.user_id]);
      const creditMap = await resolvePbmCreditedOpps(pbmSfIdMap);
      const credits = creditMap.get(opp.salesforce_opportunity_id);
      if (credits && credits.length > 0) {
        creditInfo = credits[0];
      }
    }

    return NextResponse.json({
      data: {
        ...opp,
        ...(creditInfo ? {
          credit_path: creditInfo.credit_path,
          partner_name: creditInfo.partner_name,
          credited_pbm_id: creditInfo.pbm_local_id,
        } : {}),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
