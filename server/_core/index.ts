import "dotenv/config";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { createServer } from "http";
import net from "net";
import { sql } from "drizzle-orm";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { closeDb, getDb } from "../db";
import { createContext } from "./context";
import { isLocalDevAuthEnabled } from "./localDevAuth";
import { serveStatic, setupVite } from "./vite";

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." } });
const orderLimiter = rateLimit({ windowMs: 60 * 1000, limit: 8, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Muitos pedidos em sequência. Aguarde um instante." } });
const trackingLimiter = rateLimit({ windowMs: 60 * 1000, limit: 45, standardHeaders: "draft-8", legacyHeaders: false });

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

async function findDevelopmentPort(startPort: number): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) if (await isPortAvailable(port)) return port;
  throw new Error(`No development port available starting from ${startPort}`);
}

function validateProductionEnvironment(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required in production.");
  if (process.env.DATABASE_SSL !== "true") throw new Error("DATABASE_SSL=true is required in production; database connections must use verified TLS.");
  if (!process.env.APP_URL) throw new Error("APP_URL must be the public HTTPS origin in production.");
  const url = new URL(process.env.APP_URL);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) throw new Error("APP_URL must be an HTTPS origin without a path or query.");
  if (isLocalDevAuthEnabled()) throw new Error("LOCAL_DEV_AUTH must be disabled in production.");
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? "0");
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5) throw new Error("TRUST_PROXY_HOPS must be an integer from 0 to 5.");
}

async function startServer(): Promise<void> {
  validateProductionEnvironment();
  const app = express();
  const server = createServer(app);
  app.disable("x-powered-by");
  app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? "0"));
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "64kb", extended: false }));

  app.get("/healthz", async (_req, res) => {
    const db = await getDb();
    if (!db) { res.status(503).json({ ok: false, database: "unavailable" }); return; }
    try { await db.execute(sql`select 1`); res.json({ ok: true, database: "connected" }); }
    catch { res.status(503).json({ ok: false, database: "unavailable" }); }
  });

  app.use("/api/trpc/auth.login", authLimiter);
  app.use("/api/trpc/delivery.orders.create", orderLimiter);
  app.use("/api/trpc/delivery.orders.track", trackingLimiter);
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));

  if (process.env.NODE_ENV === "development") await setupVite(app, server);
  else serveStatic(app);

  const preferredPort = Number(process.env.PORT || "3000");
  if (!Number.isInteger(preferredPort) || preferredPort < 1 || preferredPort > 65535) throw new Error("PORT must be a valid TCP port.");
  const port = process.env.NODE_ENV === "development" ? await findDevelopmentPort(preferredPort) : preferredPort;
  const host = process.env.NODE_ENV === "development" ? "127.0.0.1" : "0.0.0.0";
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  console.log(`Server running on http://localhost:${port}/`);

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Shutdown] ${signal} received; closing server and database pool.`);
    const forceExit = setTimeout(() => process.exit(1), 10_000);
    forceExit.unref();
    server.close(async error => {
      try { await closeDb(); }
      catch (closeError) { console.error("[Shutdown] Database pool did not close cleanly.", closeError); }
      if (error) { console.error("[Shutdown] HTTP server did not close cleanly.", error); process.exitCode = 1; }
      clearTimeout(forceExit);
    });
    server.closeIdleConnections();
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

startServer().catch(error => {
  console.error("[Startup] Server could not start:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
