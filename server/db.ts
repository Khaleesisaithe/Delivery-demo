import { readFileSync } from "node:fs";
import { createPool, type PoolOptions } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";

let dbInstance: ReturnType<typeof drizzle> | null = null;

function databaseOptions(connectionString: string): PoolOptions {
  const uri = new URL(connectionString);
  if (!['mysql:', 'mysql2:'].includes(uri.protocol)) throw new Error("DATABASE_URL must use the mysql:// scheme.");
  const options: PoolOptions = {
    host: uri.hostname,
    port: Number(uri.port || 3306),
    user: decodeURIComponent(uri.username),
    password: decodeURIComponent(uri.password),
    database: decodeURIComponent(uri.pathname.replace(/^\//, "")),
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || (process.env.VERCEL ? "3" : "10")),
    queueLimit: 100,
    connectTimeout: 10_000,
    timezone: "Z",
    charset: "utf8mb4",
    multipleStatements: false,
  };
  if (process.env.DATABASE_SSL === "true") {
    const caFile = process.env.DATABASE_SSL_CA_FILE;
    const caValue = process.env.DATABASE_SSL_CA;
    if (caFile && caValue) throw new Error("Set only one of DATABASE_SSL_CA_FILE and DATABASE_SSL_CA.");
    options.ssl = {
      ...(caFile ? { ca: readFileSync(caFile, "utf8") } : {}),
      ...(caValue ? { ca: caValue.replace(/\\n/g, "\n") } : {}),
      rejectUnauthorized: true,
      verifyIdentity: true,
      minVersion: "TLSv1.2",
    };
  }
  return options;
}

export async function getDb() {
  if (dbInstance) return dbInstance;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  try {
    const connectionLimit = Number(process.env.DB_CONNECTION_LIMIT || (process.env.VERCEL ? "3" : "10"));
    if (!Number.isInteger(connectionLimit) || connectionLimit < 1 || connectionLimit > 50) {
      throw new Error("DB_CONNECTION_LIMIT must be an integer from 1 to 50.");
    }
    const client = createPool(databaseOptions(connectionString));
    // pnpm can resolve mysql2's promise declarations through two peer paths;
    // both are the same runtime Pool implementation, but TypeScript treats them as distinct.
    dbInstance = drizzle(client as any, { mode: "default" });
    return dbInstance;
  } catch (error) {
    console.error("[Database] Could not initialize the MySQL pool", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}

export async function closeDb(): Promise<void> {
  if (!dbInstance) return;
  await dbInstance.$client.end();
  dbInstance = null;
}
