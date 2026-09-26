import { sql } from "drizzle-orm";
import { publicProcedure, router } from "./trpc.js";
import { getDb } from "../db.js";

export const systemRouter = router({
  health: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { ok: false, database: "unavailable" as const };
    try {
      await db.execute(sql`select 1`);
      return { ok: true, database: "connected" as const };
    } catch {
      return { ok: false, database: "unavailable" as const };
    }
  }),
});
