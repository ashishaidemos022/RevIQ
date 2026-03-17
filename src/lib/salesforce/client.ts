import jsforce, { Connection } from 'jsforce';

let connection: Connection | null = null;
let tokenExpiresAt: number = 0;

function getConfig() {
  const loginUrl = process.env.SALESFORCE_LOGIN_URL;
  const username = process.env.SALESFORCE_USERNAME;
  const password = process.env.SALESFORCE_PASSWORD;

  if (!loginUrl || !username || !password) {
    throw new Error(
      'Missing Salesforce configuration. Required: SALESFORCE_LOGIN_URL, SALESFORCE_USERNAME, SALESFORCE_PASSWORD'
    );
  }

  return { loginUrl, username, password };
}

export async function getSalesforceConnection(): Promise<Connection> {
  const now = Date.now();

  // Reuse connection if token is still valid (with 5-min buffer)
  if (connection && tokenExpiresAt > now + 5 * 60 * 1000) {
    return connection;
  }

  const config = getConfig();

  const conn = new jsforce.Connection({
    loginUrl: config.loginUrl,
  });

  await conn.login(config.username, config.password);

  // Salesforce sessions typically last 2 hours
  tokenExpiresAt = now + 2 * 60 * 60 * 1000;
  connection = conn;

  return conn;
}
