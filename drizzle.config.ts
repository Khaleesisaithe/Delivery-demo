import { readFileSync } from "node:fs";
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

const databaseUrl = new URL(connectionString);
if (!["mysql:", "mysql2:"].includes(databaseUrl.protocol)) {
  throw new Error("DATABASE_URL must use the mysql:// scheme.");
}

const caFile = process.env.DATABASE_SSL_CA_FILE;
const caValue = process.env.DATABASE_SSL_CA;
if (caFile && caValue) {
  throw new Error("Set only one of DATABASE_SSL_CA_FILE and DATABASE_SSL_CA.");
}
const ssl = process.env.DATABASE_SSL === "true"
  ? {
      ...(caFile ? { ca: readFileSync(caFile, "utf8") } : {}),
      ...(caValue ? { ca: caValue.replace(/\\n/g, "\n") } : {}),
      rejectUnauthorized: true,
    }
  : undefined;

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    host: decodeURIComponent(databaseUrl.hostname),
    port: Number(databaseUrl.port || 3306),
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    database: decodeURIComponent(databaseUrl.pathname.replace(/^\//, "")),
    ...(ssl ? { ssl } : {}),
  },
});
