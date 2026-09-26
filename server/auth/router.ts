import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authSessions, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { clearSessionCookie, issueSession, revokeRequestSession, toSessionUser } from "./session";
import { hashPassword, newTemporaryPassword, verifyPassword } from "./password";

const emailSchema = z.string().trim().email().max(320).transform(value => value.toLowerCase());
const passwordSchema = z.string().min(12).max(128);
const genericLoginError = () => new TRPCError({ code: "UNAUTHORIZED", message: "E-mail ou senha inválidos." });
const dummyPasswordHash = hashPassword(newTemporaryPassword());

export const authRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.user),
  login: publicProcedure.input(z.object({ email: emailSchema, password: z.string().min(1).max(128) })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Serviço temporariamente indisponível." });
    const [account] = await db.select().from(users).where(eq(users.emailNormalized, input.email)).limit(1);
    const now = new Date();
    const locked = Boolean(account?.lockedUntil && account.lockedUntil > now);
    const passwordMatches = await verifyPassword(input.password, account?.passwordHash ?? await dummyPasswordHash);
    if (!account || !account.isActive || locked || !passwordMatches) {
      if (account && account.isActive && !locked) {
        const failedLoginAttempts = account.failedLoginAttempts + 1;
        await db.update(users).set({
          failedLoginAttempts,
          lockedUntil: failedLoginAttempts >= 8 ? new Date(now.getTime() + 15 * 60 * 1000) : null,
        }).where(eq(users.id, account.id));
      }
      throw genericLoginError();
    }
    await db.update(users).set({ failedLoginAttempts: 0, lockedUntil: null, lastSignedIn: now }).where(eq(users.id, account.id));
    await issueSession(account.id, ctx.res, ctx.req);
    return toSessionUser({ ...account, failedLoginAttempts: 0, lockedUntil: null, lastSignedIn: now });
  }),
  logout: publicProcedure.mutation(async ({ ctx }) => {
    await revokeRequestSession(ctx.req);
    clearSessionCookie(ctx.res, ctx.req);
    return { success: true } as const;
  }),
  changePassword: protectedProcedure.input(z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Serviço temporariamente indisponível." });
    const [account] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
    if (!account || !account.isActive || !account.passwordHash || !(await verifyPassword(input.currentPassword, account.passwordHash))) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "A senha atual está incorreta." });
    }
    if (input.currentPassword === input.newPassword) throw new TRPCError({ code: "BAD_REQUEST", message: "Escolha uma senha diferente da atual." });
    const passwordHash = await hashPassword(input.newPassword);
    await db.transaction(async tx => {
      await tx.update(users).set({ passwordHash, passwordResetRequired: false, failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, account.id));
      await tx.delete(authSessions).where(eq(authSessions.userId, account.id));
    });
    clearSessionCookie(ctx.res, ctx.req);
    await issueSession(account.id, ctx.res, ctx.req);
    return { success: true } as const;
  }),
});
