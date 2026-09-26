import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import type { Request, Response } from "express";
import { parse } from "cookie";
import { authSessions, users, type User } from "../../drizzle/schema";
import { COOKIE_NAME } from "../../shared/const";
import { getDb } from "../db";
import { getSessionCookieOptions } from "../_core/cookies";

export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
export type SessionUser = Pick<User, "id" | "openId" | "name" | "email" | "role" | "createdAt" | "updatedAt" | "lastSignedIn" | "passwordResetRequired">;

export function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    openId: user.openId,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastSignedIn: user.lastSignedIn,
    passwordResetRequired: user.passwordResetRequired,
  };
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueSession(userId: number, res: Response, req: Request): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await db.delete(authSessions).where(lt(authSessions.expiresAt, new Date()));
  await db.insert(authSessions).values({ tokenHash: hashSessionToken(token), userId, expiresAt });
  res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(req), maxAge: SESSION_DURATION_MS });
}

export async function revokeRequestSession(req: Request): Promise<void> {
  const token = parse(req.headers.cookie ?? "")[COOKIE_NAME];
  if (!token) return;
  const db = await getDb();
  if (!db) return;
  await db.delete(authSessions).where(eq(authSessions.tokenHash, hashSessionToken(token)));
}

export function clearSessionCookie(res: Response, req: Request): void {
  res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(req), maxAge: 0 });
}

export async function readSessionUser(req: Request): Promise<SessionUser | null> {
  const token = parse(req.headers.cookie ?? "")[COOKIE_NAME];
  if (!token || token.length > 128) return null;
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select({ user: users }).from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .where(and(eq(authSessions.tokenHash, hashSessionToken(token)), gt(authSessions.expiresAt, new Date()), eq(users.isActive, true)))
    .limit(1);
  return row ? toSessionUser(row.user) : null;
}
