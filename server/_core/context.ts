import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { readSessionUser, type SessionUser } from "../auth/session.js";
import { createLocalDevUser, isLocalDevAuthEnabled } from "./localDevAuth.js";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: SessionUser | null;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  if (isLocalDevAuthEnabled()) return { req: opts.req, res: opts.res, user: createLocalDevUser() };
  const user = await readSessionUser(opts.req);
  return { req: opts.req, res: opts.res, user };
}
