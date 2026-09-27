import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { deliveryCouriers, orders } from "../../drizzle/schema.js";
import { isSupportedBrazilPhone, normalizeBrazilPhone } from "../phone.js";
import { router } from "../_core/trpc.js";
import { adminProcedure, requireDb, staffProcedure } from "./shared.js";

const courierStatusesInProgress = ["ready", "out_for_delivery"] as const;

export const couriersRouter = router({
  activeList: staffProcedure.query(async () => {
    const db = await requireDb();
    return db
      .select({
        id: deliveryCouriers.id,
        name: deliveryCouriers.name,
      })
      .from(deliveryCouriers)
      .where(eq(deliveryCouriers.isActive, true))
      .orderBy(deliveryCouriers.name)
      .limit(200);
  }),
  adminList: adminProcedure.query(async () => {
    const db = await requireDb();
    return db
      .select()
      .from(deliveryCouriers)
      .orderBy(desc(deliveryCouriers.isActive), deliveryCouriers.name)
      .limit(200);
  }),
  create: adminProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(140),
        phone: z
          .string()
          .trim()
          .max(32)
          .refine(
            isSupportedBrazilPhone,
            "Informe um telefone brasileiro com DDD."
          ),
      })
    )
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const phone = normalizeBrazilPhone(input.phone);
      const [existing] = await db
        .select({ id: deliveryCouriers.id })
        .from(deliveryCouriers)
        .where(eq(deliveryCouriers.phone, phone))
        .limit(1);
      if (existing)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Este telefone já está cadastrado para um entregador.",
        });
      await db.insert(deliveryCouriers).values({ name: input.name, phone });
      return { success: true as const };
    }),
  setActive: adminProcedure
    .input(z.object({ id: z.number().int().positive(), isActive: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      return db.transaction(async tx => {
        const [courier] = await tx
          .select({ id: deliveryCouriers.id })
          .from(deliveryCouriers)
          .where(eq(deliveryCouriers.id, input.id))
          .limit(1)
          .for("update");
        if (!courier)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Entregador não encontrado.",
          });
        if (!input.isActive) {
          const [activeAssignment] = await tx
            .select({ id: orders.id })
            .from(orders)
            .where(
              and(
                eq(orders.courierId, input.id),
                inArray(orders.status, [...courierStatusesInProgress])
              )
            )
            .limit(1)
            .for("update");
          if (activeAssignment)
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message:
                "Este entregador tem pedidos prontos ou em rota. Reatribua-os antes de desativá-lo.",
            });
        }
        await tx
          .update(deliveryCouriers)
          .set({ isActive: input.isActive })
          .where(eq(deliveryCouriers.id, input.id));
        return { success: true as const };
      });
    }),
});
