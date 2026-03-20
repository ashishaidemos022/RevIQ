export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSalesforceConnection } from '@/lib/salesforce/client';
import { requireAuth, handleAuthError } from '@/lib/auth/middleware';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    if (user.role !== 'revops_rw' && user.user_id !== 'dev-admin') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const objectName = request.nextUrl.searchParams.get('object') || 'OpportunityPartner';

    const conn = await getSalesforceConnection();
    const desc = await conn.sobject(objectName).describe();

    const fields = desc.fields.map(f => ({
      name: f.name,
      label: f.label,
      type: f.type,
      custom: f.custom,
      referenceTo: f.referenceTo,
    }));

    const childRelationships = (desc.childRelationships || []).map((cr) => ({
      childSObject: cr.childSObject,
      relationshipName: cr.relationshipName ?? null,
      field: cr.field,
    }));

    return NextResponse.json({
      objectName: desc.name,
      totalFields: fields.length,
      customFields: fields.filter(f => f.custom),
      allFields: fields,
      childRelationships,
      partnerRelationships: childRelationships.filter((cr) =>
        cr.relationshipName && (cr.relationshipName.toLowerCase().includes('partner') || cr.relationshipName.toLowerCase().includes('rv'))
      ),
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
