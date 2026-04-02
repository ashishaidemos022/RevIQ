'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

/**
 * OAuth Authorization page — the user picks a demo persona.
 *
 * This is the equivalent of "sign in with Okta" for the demo.
 * The MCP client redirects here; after picking a persona the user
 * is redirected back with an authorization code.
 */

const PERSONAS = [
  {
    userId: 'demo-usr-001',
    role: 'cro',
    fullName: 'Sara Chen',
    email: 'sara.chen@orbisai.com',
    title: 'Chief Revenue Officer',
    description: 'Full company visibility across all regions, AEs, and PBMs',
    color: '#8b5cf6',
  },
  {
    userId: 'demo-usr-004',
    role: 'leader',
    fullName: 'Mike Torres',
    email: 'mike.torres@orbisai.com',
    title: 'VP Sales — West',
    description: 'West region team view with 3 AEs and their pipeline',
    color: '#2563eb',
  },
  {
    userId: 'demo-usr-008',
    role: 'enterprise_ae',
    fullName: 'Ashley Park',
    email: 'ashley.park@orbisai.com',
    title: 'Enterprise Account Executive',
    description: 'Individual AE view — own pipeline, quota, and commissions',
    color: '#059669',
  },
  {
    userId: 'demo-usr-003',
    role: 'revops_rw',
    fullName: 'James Rivera',
    email: 'james.rivera@orbisai.com',
    title: 'Revenue Operations',
    description: 'Full read/write — quotas, commission rates, sync controls',
    color: '#d97706',
  },
  {
    userId: 'demo-usr-002',
    role: 'c_level',
    fullName: 'Diana Wells',
    email: 'diana.wells@orbisai.com',
    title: 'Chief Financial Officer',
    description: 'Executive view with quota and commission rate access',
    color: '#e11d48',
  },
];

function AuthorizeForm() {
  const searchParams = useSearchParams();
  const [submitting, setSubmitting] = useState<string | null>(null);

  const clientId = searchParams.get('client_id') || '';
  const redirectUri = searchParams.get('redirect_uri') || '';
  const state = searchParams.get('state') || '';
  const codeChallenge = searchParams.get('code_challenge') || '';
  const codeChallengeMethod = searchParams.get('code_challenge_method') || 'S256';
  const scope = searchParams.get('scope') || '';

  async function handleSelect(persona: typeof PERSONAS[number]) {
    setSubmitting(persona.userId);

    const body = new URLSearchParams({
      user_id: persona.userId,
      role: persona.role,
      full_name: persona.fullName,
      email: persona.email,
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      scope,
    });

    const res = await fetch('/api/oauth/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      redirect: 'manual',
    });

    if (res.status === 302 || res.status === 303) {
      const location = res.headers.get('location');
      if (location) {
        window.location.href = location;
        return;
      }
    }

    // If redirect didn't come via header, check JSON response
    const json = await res.json().catch(() => null);
    if (json?.redirect_uri) {
      window.location.href = json.redirect_uri;
    } else {
      setSubmitting(null);
      alert(json?.error || 'Authorization failed');
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f1117',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{ maxWidth: 560, width: '100%', padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 700, margin: '0 0 8px' }}>
            TD RevenueIQ
          </h1>
          <p style={{ color: '#9ca3af', fontSize: 14, margin: 0 }}>
            Select a persona to authenticate with the MCP server
          </p>
          {clientId && (
            <p style={{ color: '#6b7280', fontSize: 12, marginTop: 8 }}>
              Authorizing: <strong style={{ color: '#9ca3af' }}>{clientId}</strong>
            </p>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {PERSONAS.map((persona) => (
            <button
              key={persona.userId}
              onClick={() => handleSelect(persona)}
              disabled={submitting !== null}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '16px 20px',
                background: submitting === persona.userId ? '#1e2230' : '#161922',
                border: '1px solid #2a2f42',
                borderRadius: 12,
                cursor: submitting ? 'wait' : 'pointer',
                textAlign: 'left',
                opacity: submitting && submitting !== persona.userId ? 0.5 : 1,
                transition: 'all 0.15s',
              }}
            >
              <div style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: persona.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 16,
                fontWeight: 700,
                flexShrink: 0,
              }}>
                {persona.fullName.split(' ').map(n => n[0]).join('')}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#f3f4f6', fontSize: 15, fontWeight: 600 }}>
                  {persona.fullName}
                </div>
                <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 2 }}>
                  {persona.title}
                </div>
                <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>
                  {persona.description}
                </div>
              </div>
              <div style={{
                padding: '4px 10px',
                background: `${persona.color}22`,
                border: `1px solid ${persona.color}44`,
                borderRadius: 6,
                color: persona.color,
                fontSize: 11,
                fontWeight: 600,
                fontFamily: 'monospace',
                flexShrink: 0,
              }}>
                {persona.role}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AuthorizePage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh',
        background: '#0f1117',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#9ca3af',
      }}>
        Loading...
      </div>
    }>
      <AuthorizeForm />
    </Suspense>
  );
}
