import type { SamlConfig } from '@node-saml/node-saml';

export function getSamlOptions(): SamlConfig {
  return {
    callbackUrl: process.env.OKTA_SAML_CALLBACK_URL || 'http://localhost:3000/api/auth/saml/callback',
    entryPoint: process.env.OKTA_SAML_ENTRY_POINT || '',
    issuer: process.env.SAML_SP_ENTITY_ID || 'td-revenueiq',
    idpCert: process.env.OKTA_SAML_CERT || '',
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: false,
  };
}
