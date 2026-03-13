import { NextResponse } from 'next/server';
import { SAML } from '@node-saml/node-saml';
import { getSamlOptions } from '@/lib/auth/saml-config';

export async function GET() {
  try {
    const saml = new SAML(getSamlOptions());
    const loginUrl = await saml.getAuthorizeUrlAsync('', undefined, {});
    return NextResponse.redirect(loginUrl);
  } catch (error) {
    console.error('SAML login error:', error);
    return NextResponse.redirect(
      new URL('/login?error=saml_init_failed', process.env.NEXT_PUBLIC_APP_URL!)
    );
  }
}
