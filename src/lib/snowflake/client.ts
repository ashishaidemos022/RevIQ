import snowflake from 'snowflake-sdk';
import { isDemoMode } from '@/lib/demo';

// Disable ocsp check to avoid issues in serverless environments
snowflake.configure({ ocspFailOpen: true });

interface SnowflakeConfig {
  account: string;
  username: string;
  password: string;
  warehouse: string;
  database: string;
  schema: string;
}

function getSnowflakeConfig(): SnowflakeConfig {
  const account = process.env.SNOWFLAKE_ACCOUNT;
  const username = process.env.SNOWFLAKE_USERNAME;
  const password = process.env.SNOWFLAKE_PASSWORD;
  const warehouse = process.env.SNOWFLAKE_WAREHOUSE;
  const database = process.env.SNOWFLAKE_DATABASE;
  const schema = process.env.SNOWFLAKE_SCHEMA;

  if (!account || !username || !password || !warehouse || !database || !schema) {
    throw new Error(
      'Missing Snowflake configuration. Required env vars: SNOWFLAKE_ACCOUNT, SNOWFLAKE_USERNAME, SNOWFLAKE_PASSWORD, SNOWFLAKE_WAREHOUSE, SNOWFLAKE_DATABASE, SNOWFLAKE_SCHEMA'
    );
  }

  return { account, username, password, warehouse, database, schema };
}

export async function executeSnowflakeQuery<T = Record<string, unknown>>(
  sql: string,
  binds: snowflake.Binds = []
): Promise<T[]> {
  if (isDemoMode()) {
    // Demo mode — never connect to Snowflake; sync functions use mock data directly
    return [];
  }

  const config = getSnowflakeConfig();

  const connection = snowflake.createConnection({
    account: config.account,
    username: config.username,
    password: config.password,
    warehouse: config.warehouse,
    database: config.database,
    schema: config.schema,
  });

  // Connect
  await new Promise<void>((resolve, reject) => {
    connection.connect((err) => {
      if (err) {
        reject(new Error(`Snowflake connection failed: ${err.message}`));
      } else {
        resolve();
      }
    });
  });

  try {
    // Execute query
    const rows = await new Promise<T[]>((resolve, reject) => {
      connection.execute({
        sqlText: sql,
        binds: binds as snowflake.Binds,
        complete: (err, _stmt, rows) => {
          if (err) {
            reject(new Error(`Snowflake query failed: ${err.message}`));
          } else {
            resolve((rows || []) as T[]);
          }
        },
      });
    });

    return rows;
  } finally {
    // Destroy connection
    connection.destroy((err) => {
      if (err) {
        console.error('Snowflake connection cleanup error:', err.message);
      }
    });
  }
}
