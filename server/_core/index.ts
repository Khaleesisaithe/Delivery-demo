import "dotenv/config";
import { createServer } from "http";
import net from "net";
import { createApp } from "../app.js";
import { closeDb } from "../db.js";
import { serveStatic, setupVite } from "./vite.js";

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

async function startServer(): Promise<void> {
  const app = createApp();
  const server = createServer(app);
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
