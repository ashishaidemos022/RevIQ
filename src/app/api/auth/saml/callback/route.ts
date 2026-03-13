import { NextRequest, NextResponse } from 'next/server';
import { SAML } from '@node-saml/node-saml';
import { getSamlOptions } from '@/lib/auth/saml-config';
import { createSession } from '@/lib/auth/session';
import { getSupabaseClient } from '@/lib/supabase/client';
import { UserRole } from '@/types';

// Use 303 See Other for all redirects from this POST handler
// so the browser follows up with GET (not POST)
function redirectWithGet(url: URL): NextResponse {
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const samlResponse = formData.get('SAMLResponse') as string;

    if (!samlResponse) {
      return redirectWithGet(
        new URL('/login?error=no_saml_response', process.env.NEXT_PUBLIC_APP_URL!)
      );
    }

    const saml = new SAML(getSamlOptions());
    const { profile } = await saml.validatePostResponseAsync({ SAMLResponse: samlResponse });

    if (!profile) {
      return redirectWithGet(
        new URL('/login?error=invalid_saml', process.env.NEXT_PUBLIC_APP_URL!)
      );
    }

    // nameID is the email when NameID format is emailAddress (Okta default)
    const email = profile.email || profile['email'] || profile.nameID;
    const oktaId = profile['okta_id'] || profile.nameID;
    const fullName = profile['full_name'] || profile['displayName'] || email;
    const role = (profile['role'] || 'ae') as UserRole;

    if (!oktaId || !email) {
      return redirectWithGet(
        new URL('/login?error=missing_attributes', process.env.NEXT_PUBLIC_APP_URL!)
      );
    }

    // JIT provisioning: look up or create user
    const db = getSupabaseClient();
    let { data: user } = await db
      .from('users')
      .select('id, role, email, full_name')
      .eq('okta_id', oktaId)
      .single();

    if (!user) {
      const { data: newUser, error } = await db
        .from('users')
        .insert({
          okta_id: oktaId,
          email,
          full_name: fullName,
          role,
        })
        .select('id, role, email, full_name')
        .single();

      if (error) {
        console.error('JIT provisioning error:', error);
        return redirectWithGet(
          new URL('/login?error=provisioning_failed', process.env.NEXT_PUBLIC_APP_URL!)
        );
      }
      user = newUser;
    }

    await createSession({
      user_id: user.id,
      role: user.role as UserRole,
      email: user.email,
      full_name: user.full_name,
    });

    return redirectWithGet(new URL('/home', process.env.NEXT_PUBLIC_APP_URL!));
  } catch (error) {
    console.error('SAML callback error:', error);
    return redirectWithGet(
      new URL('/login?error=saml_validation_failed', process.env.NEXT_PUBLIC_APP_URL!)
    );
  }
}
