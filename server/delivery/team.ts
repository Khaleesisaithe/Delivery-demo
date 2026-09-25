import { TRPCError } from "@trpc/server";
import { desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { users } from "../../drizzle/schema";
import { adminProcedure, requireDb } from "./shared";
import { router } from "../_core/trpc";

export const teamRouter = router({
  list: adminProcedure.query(async () => {
    const db = await requireDb();
    return db.select({ id: users.id, name: users.name, email: users.email, role: users.role, lastSignedIn: users.lastSignedIn })
      .from(users).where(ne(users.role, "admin")).orderBy(desc(users.lastSignedIn)).limit(100);
  }),
  setRole: adminProcedure.input(z.object({ id: z.number().int().positive(), role: z.enum(["staff", "user"]) })).mutation(async ({ input }) => {
    const db = await requireDb();
    const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, input.id)).limit(1);
    if (!target || target.role === "admin") throw new TRPCError({ code: "NOT_FOUND", message: "Conta não encontrada ou não pode ser alterada." });
    await db.update(users).set({ role: input.role }).where(eq(users.id, input.id));
    return { success: true } as const;
  }),
});
