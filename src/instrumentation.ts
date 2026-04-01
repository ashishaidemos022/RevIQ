/**
 * Next.js instrumentation hook — runs once at server startup.
 *
 * When DEMO_MODE=true this validates that no real backend credentials
 * are present in the environment. If any are found, startup is aborted
 * with a clear error message to prevent demo mode from accidentally
 * talking to production systems.
 *
 * docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.DEMO_MODE !== 'true') return;

  // Secrets that must NOT be set when running in demo mode
  const FORBIDDEN_IN_DEMO: Array<{ env: string; label: string }> = [
    { env: 'SUPABASE_SERVICE_ROLE_KEY', label: 'Supabase service role key' },
    { env: 'SALESFORCE_CLIENT_SECRET',  label: 'Salesforce OAuth client secret' },
    { env: 'SNOWFLAKE_PASSWORD',         label: 'Snowflake password' },
    { env: 'SCIM_BEARER_TOKEN',          label: 'Okta SCIM bearer token' },
  ];

  const found = FORBIDDEN_IN_DEMO.filter(({ env }) => {
    const val = process.env[env];
    return val !== undefined && val.trim() !== '';
  });

  if (found.length === 0) {
    console.log(
      '[demo] ✓ Demo mode active — mock data only, no real backends connected.\n' +
      '[demo]   Personas: CRO · VP Sales · Enterprise AE · RevOps · C-Level\n' +
      '[demo]   Company:  Orbis AI (fictional)\n' +
      '[demo]   Login:    http://localhost:3000/login'
    );
    return;
  }

  // Real secrets detected — refuse to start
  const lines = found.map(f => `  • ${f.env} (${f.label})`).join('\n');
  const message =
    '\n' +
    '╔══════════════════════════════════════════════════════════════════╗\n' +
    '║           DEMO MODE STARTUP SAFETY CHECK FAILED                  ║\n' +
    '╠══════════════════════════════════════════════════════════════════╣\n' +
    '║                                                                  ║\n' +
    '║  DEMO_MODE=true but real backend secrets are present.            ║\n' +
    '║  This would connect demo mode to production systems.             ║\n' +
    '║                                                                  ║\n' +
    '║  Remove or unset these environment variables, then restart:      ║\n' +
    '║                                                                  ║\n' +
    lines.split('\n').map(l => `║  ${l.padEnd(64)}║`).join('\n') + '\n' +
    '║                                                                  ║\n' +
    '║  If you want to run against real backends, unset DEMO_MODE.      ║\n' +
    '║                                                                  ║\n' +
    '╚══════════════════════════════════════════════════════════════════╝\n';

  console.error(message);
  throw new Error(
    `Demo mode safety check failed: real secrets found for [${found.map(f => f.env).join(', ')}]. ` +
    'Remove them or unset DEMO_MODE to continue.'
  );
}
