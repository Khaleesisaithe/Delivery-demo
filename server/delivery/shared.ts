import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { protectedProcedure } from "../_core/trpc";

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Acesso exclusivo do proprietário." });
  return next({ ctx });
});

export const staffProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "staff") throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito à equipe da loja." });
  return next({ ctx });
});

export async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
  return db;
}

export const statusLabels = {
  received: "Pedido recebido",
  confirmed: "Pedido confirmado",
  preparing: "Em preparação",
  ready: "Pronto",
  out_for_delivery: "Saiu para entrega",
  delivered: "Entregue",
  cancelled: "Cancelado",
  rejected: "Recusado",
} as const;

export type OrderStatus = keyof typeof statusLabels;
