import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { authSessions, users } from "../../drizzle/schema.js";
import { adminProcedure, requireDb } from "./shared.js";
import { router } from "../_core/trpc.js";
import { hashPassword, newTemporaryPassword } from "../auth/password.js";

export const teamRouter = router({
  list: adminProcedure.query(async () => {
    const db = await requireDb();
    return db.select({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive, lastSignedIn: users.lastSignedIn })
      .from(users).where(eq(users.role, "staff")).orderBy(desc(users.lastSignedIn)).limit(100);
  }),
  setActive: adminProcedure.input(z.object({ id: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ input }) => {
    const db = await requireDb();
    const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, input.id)).limit(1);
    if (!target || target.role !== "staff") throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado." });
    await db.transaction(async tx => {
      await tx.update(users).set({ isActive: input.isActive }).where(eq(users.id, input.id));
      if (!input.isActive) await tx.delete(authSessions).where(eq(authSessions.userId, input.id));
    });
    return { success: true } as const;
  }),
  createStaff: adminProcedure.input(z.object({ name: z.string().trim().min(2).max(140), email: z.string().trim().email().max(320).transform(value => value.toLowerCase()) })).mutation(async ({ input }) => {
    const db = await requireDb();
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.emailNormalized, input.email)).limit(1);
    if (existing) throw new TRPCError({ code: "CONFLICT", message: "Já existe uma conta com esse e-mail." });
    const temporaryPassword = newTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    await db.insert(users).values({
      openId: `local_${randomBytes(24).toString("hex")}`,
      name: input.name,
      email: input.email,
      emailNormalized: input.email,
      passwordHash,
      passwordResetRequired: true,
      loginMethod: "password",
      role: "staff",
    });
    return { success: true as const, temporaryPassword };
  }),
  resetStaffPassword: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
    const db = await requireDb();
    const [target] = await db.select({ id: users.id, role: users.role, isActive: users.isActive }).from(users).where(eq(users.id, input.id)).limit(1);
    if (!target || target.role !== "staff" || !target.isActive) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário ativo não encontrado." });
    const temporaryPassword = newTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    await db.transaction(async tx => {
      await tx.update(users).set({ passwordHash, passwordResetRequired: true, failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, input.id));
      await tx.delete(authSessions).where(eq(authSessions.userId, input.id));
    });
    return { success: true as const, temporaryPassword };
  }),
});
