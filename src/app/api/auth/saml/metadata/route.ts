import { NextResponse } from 'next/server';
import { SAML } from '@node-saml/node-saml';
import { getSamlOptions } from '@/lib/auth/saml-config';

export async function GET() {
  try {
    const saml = new SAML(getSamlOptions());
    const metadata = saml.generateServiceProviderMetadata(null, null);
    return new NextResponse(metadata, {
      headers: { 'Content-Type': 'application/xml' },
    });
  } catch (error) {
    console.error('SAML metadata error:', error);
    return NextResponse.json({ error: 'Failed to generate metadata' }, { status: 500 });
  }
}
