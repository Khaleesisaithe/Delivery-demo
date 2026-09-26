import "dotenv/config";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import { rateLimit } from "express-rate-limit";
import { sql } from "drizzle-orm";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { createContext } from "./_core/context";
import { isLocalDevAuthEnabled } from "./_core/localDevAuth";

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." } });
const orderLimiter = rateLimit({ windowMs: 60 * 1000, limit: 8, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Muitos pedidos em sequência. Aguarde um instante." } });
const trackingLimiter = rateLimit({ windowMs: 60 * 1000, limit: 45, standardHeaders: "draft-8", legacyHeaders: false });

export function validateProductionEnvironment(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required in production.");
  if (process.env.DATABASE_SSL !== "true") throw new Error("DATABASE_SSL=true is required in production; database connections must use verified TLS.");
  const publicUrl = process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (!publicUrl) throw new Error("APP_URL or VERCEL_URL must identify the public HTTPS origin in production.");
  const url = new URL(publicUrl.startsWith("http") ? publicUrl : `https://${publicUrl}`);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) throw new Error("APP_URL must be an HTTPS origin without a path or query.");
  if (isLocalDevAuthEnabled()) throw new Error("LOCAL_DEV_AUTH must be disabled in production.");
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? (process.env.VERCEL ? "1" : "0"));
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5) throw new Error("TRUST_PROXY_HOPS must be an integer from 0 to 5.");
}

export function createApp(app = express()) {
  validateProductionEnvironment();
  app.disable("x-powered-by");
  app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? (process.env.VERCEL ? "1" : "0")));
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
  if (process.env.VERCEL) {
    app.get("*", (_req, res) => res.sendFile(path.resolve(process.cwd(), "public", "index.html")));
  }
  return app;
}
