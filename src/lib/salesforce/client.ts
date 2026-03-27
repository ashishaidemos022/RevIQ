import jsforce, { Connection } from 'jsforce';

let connection: Connection | null = null;
let tokenExpiresAt: number = 0;
let cachedInstanceUrl: string | null = null;

/**
 * Returns the Salesforce instance URL (e.g., https://talkdesk.my.salesforce.com).
 * Requires at least one prior call to getSalesforceConnection().
 * If no connection has been made yet, connects first.
 */
export async function getSalesforceInstanceUrl(): Promise<string> {
  if (cachedInstanceUrl) return cachedInstanceUrl;
  const conn = await getSalesforceConnection();
  return conn.instanceUrl;
}

function getConfig() {
  const loginUrl = process.env.SALESFORCE_LOGIN_URL;
  const clientId = process.env.SALESFORCE_CLIENT_ID;
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;

  if (!loginUrl || !clientId || !clientSecret) {
    throw new Error(
      'Missing Salesforce configuration. Required: SALESFORCE_LOGIN_URL, SALESFORCE_CLIENT_ID, SALESFORCE_CLIENT_SECRET'
    );
  }

  return { loginUrl, clientId, clientSecret };
}

export async function getSalesforceConnection(): Promise<Connection> {
  const now = Date.now();

  // Reuse connection if token is still valid (with 5-min buffer)
  if (connection && tokenExpiresAt > now + 5 * 60 * 1000) {
    return connection;
  }

  const config = getConfig();

  // OAuth 2.0 Client Credentials flow
  const tokenUrl = `${config.loginUrl}/services/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Salesforce OAuth failed (${res.status}): ${errText}`);
  }

  const token = await res.json();

  const conn = new jsforce.Connection({
    instanceUrl: token.instance_url,
    accessToken: token.access_token,
  });

  // Token typically lasts 2 hours
  tokenExpiresAt = now + 2 * 60 * 60 * 1000;
  connection = conn;
  cachedInstanceUrl = token.instance_url;

  return conn;
}
