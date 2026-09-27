import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lt,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import {
  categories,
  customers,
  deliveryCouriers,
  orderInternalNotes,
  orderItemOptions,
  orderItems,
  orderStatusHistory,
  orders,
  productOptions,
  products,
  storeSettings,
} from "../../drizzle/schema.js";
import { buildWhatsAppLink, notifyOrderStatus } from "../whatsapp.js";
import {
  adminProcedure,
  staffProcedure,
  requireDb,
  statusLabels,
} from "./shared.js";
import {
  businessDateKey,
  businessDayBounds,
  businessDayRange,
} from "./businessDay.js";
import {
  canAssignCourier,
  canDispatchDelivery,
  canTransitionOrder,
} from "./workflow.js";
import {
  canEditCustomerOrder,
  recalculateEditedSubtotal,
} from "./orderEditing.js";
import {
  COMPLETED_ORDER_STATUSES,
  getOrderHistoryCutoff,
} from "./retention.js";
import { isSupportedBrazilPhone, normalizeBrazilPhone } from "../phone.js";
import { publicProcedure, router } from "../_core/trpc.js";
import { formatBRL, getEffectivePriceCents } from "../../shared/pricing.js";
import { isFullName, isValidBrazilianCep } from "./orderValidation.js";

const statusValues = Object.keys(statusLabels) as [
  keyof typeof statusLabels,
  ...(keyof typeof statusLabels)[],
];
const ownerEditProcedure = staffProcedure.use(({ ctx, next }) => {
  if (!canEditCustomerOrder(ctx.user.role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Somente o proprietário pode alterar os dados ou itens do pedido.",
    });
  return next({ ctx });
});
const orderInput = z.object({
  customerName: z
    .string()
    .trim()
    .min(2)
    .max(140)
    .refine(isFullName, "Informe nome e sobrenome."),
  phone: z
    .string()
    .trim()
    .max(32)
    .refine(isSupportedBrazilPhone, "Informe um telefone brasileiro com DDD."),
  deliveryType: z.enum(["delivery", "pickup"]),
  paymentMethod: z.enum(["pix", "cash", "card_delivery", "card_pickup"]),
  changeForCents: z.number().int().min(0).nullable().optional(),
  postalCode: z.string().trim().max(16).optional(),
  street: z.string().trim().max(180).optional(),
  streetNumber: z.string().trim().max(32).optional(),
  complement: z.string().trim().max(140).optional(),
  neighborhood: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  reference: z.string().trim().max(200).optional(),
  customerNote: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(20),
        optionIds: z
          .array(z.number().int().positive())
          .max(20)
          .refine(
            ids => new Set(ids).size === ids.length,
            "Adicionais duplicados não são permitidos."
          ),
        note: z.string().trim().max(500).optional(),
      })
    )
    .min(1)
    .max(50),
});

export const ordersRouter = router({
  create: publicProcedure.input(orderInput).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const [store] = await db.select().from(storeSettings).limit(1);
    if (!store)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "A loja ainda não foi configurada.",
      });
    const isPaused = Boolean(
      store.pauseUntil && new Date(store.pauseUntil).getTime() > Date.now()
    );
    if (!store.isOpen || isPaused)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: isPaused
          ? "A loja está em pausa temporária."
          : "A loja está fechada no momento.",
      });
    let paymentMethods: string[];
    try {
      paymentMethods = JSON.parse(store.paymentMethods || "[]");
    } catch {
      paymentMethods = [];
    }
    if (!paymentMethods.includes(input.paymentMethod))
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Essa forma de pagamento não está disponível.",
      });
    if (
      input.deliveryType === "delivery" &&
      (!input.street ||
        !input.streetNumber ||
        !input.neighborhood ||
        !input.city)
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Informe o endereço completo para entrega.",
      });
    }
    if (
      input.deliveryType === "delivery" &&
      (!input.postalCode || !isValidBrazilianCep(input.postalCode))
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Informe um CEP válido com oito dígitos para a entrega.",
      });
    }
    if (
      input.deliveryType === "pickup" &&
      input.paymentMethod === "card_delivery"
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Cartão na entrega só está disponível para pedidos de entrega.",
      });
    if (
      input.deliveryType === "delivery" &&
      input.paymentMethod === "card_pickup"
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cartão na retirada só está disponível para retirada.",
      });
    if (input.paymentMethod !== "cash" && input.changeForCents)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Troco só pode ser informado para pagamento em dinheiro.",
      });

    const uniqueProductIds = Array.from(
      new Set(input.items.map(item => item.productId))
    );
    const uniqueOptionIds = Array.from(
      new Set(input.items.flatMap(item => item.optionIds))
    );
    const [productRows, activeCategoryRows] = await Promise.all([
      db.select().from(products).where(inArray(products.id, uniqueProductIds)),
      db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.isActive, true)),
    ]);
    const activeCategoryIds = new Set(
      activeCategoryRows.map(category => category.id)
    );
    const optionRows = uniqueOptionIds.length
      ? await db
          .select()
          .from(productOptions)
          .where(
            and(
              inArray(productOptions.id, uniqueOptionIds),
              eq(productOptions.isAvailable, true)
            )
          )
      : [];
    const productById = new Map(productRows.map(item => [item.id, item]));
    const optionById = new Map(optionRows.map(item => [item.id, item]));
    const snapshots = input.items.map(item => {
      const product = productById.get(item.productId);
      if (
        !product ||
        !product.isAvailable ||
        !activeCategoryIds.has(product.categoryId)
      )
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Um produto do carrinho ficou indisponível. Atualize seu pedido.",
        });
      const chosen = item.optionIds.map(id => optionById.get(id));
      if (chosen.some(option => !option || option.productId !== item.productId))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Um adicional selecionado não pertence a este produto.",
        });
      const options = chosen.filter(
        (option): option is NonNullable<typeof option> => Boolean(option)
      );
      return {
        item,
        product,
        options,
        unitPriceCents:
          getEffectivePriceCents(product) +
          options.reduce((sum, option) => sum + option.priceCents, 0),
      };
    });
    const subtotalCents = snapshots.reduce(
      (sum, entry) => sum + entry.unitPriceCents * entry.item.quantity,
      0
    );
    if (!Number.isSafeInteger(subtotalCents) || subtotalCents > 5_000_000)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "O valor total do pedido excede o limite permitido.",
      });
    if (
      input.deliveryType === "delivery" &&
      subtotalCents < store.minimumOrderCents
    ) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `O pedido mínimo é R$ ${(store.minimumOrderCents / 100).toFixed(2).replace(".", ",")}.`,
      });
    }
    const deliveryFeeCents =
      input.deliveryType === "delivery" ? store.deliveryFeeCents : 0;
    const totalCents = subtotalCents + deliveryFeeCents;
    if (
      input.paymentMethod === "cash" &&
      input.changeForCents !== null &&
      input.changeForCents !== undefined &&
      input.changeForCents < totalCents
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "O valor informado para troco precisa cobrir o total do pedido.",
      });
    }
    const publicId = randomBytes(12).toString("hex");
    const phone = normalizeBrazilPhone(input.phone);
    const origin =
      process.env.APP_URL ||
      ctx.req.get("origin") ||
      `${ctx.req.protocol}://${ctx.req.get("host")}`;

    const order = await db.transaction(async tx => {
      await tx
        .insert(customers)
        .values({ name: input.customerName, phone })
        .onDuplicateKeyUpdate({ set: { name: input.customerName } });
      const [customer] = await tx
        .select()
        .from(customers)
        .where(eq(customers.phone, phone))
        .limit(1);
      if (!customer)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Não foi possível salvar os dados do cliente.",
        });
      const [created] = await tx
        .insert(orders)
        .values({
          publicId,
          orderNumber: null,
          customerId: customer.id,
          deliveryType: input.deliveryType,
          status: "received",
          paymentMethod: input.paymentMethod,
          changeForCents: input.changeForCents ?? null,
          subtotalCents,
          deliveryFeeCents,
          discountCents: 0,
          totalCents,
          postalCode: input.postalCode || null,
          street: input.street || null,
          streetNumber: input.streetNumber || null,
          complement: input.complement || null,
          neighborhood: input.neighborhood || null,
          city: input.city || null,
          reference: input.reference || null,
          customerNote: input.customerNote || null,
        })
        .$returningId();
      const orderNumber = `BP-${String(created.id).padStart(5, "0")}`;
      await tx
        .update(orders)
        .set({ orderNumber })
        .where(eq(orders.id, created.id));
      await tx.insert(orderStatusHistory).values({
        orderId: created.id,
        status: "received",
        note: "Pedido realizado pelo site",
        changedBy: input.customerName,
      });
      for (const entry of snapshots) {
        const [createdItem] = await tx
          .insert(orderItems)
          .values({
            orderId: created.id,
            productId: entry.product.id,
            productName: entry.product.name,
            unitPriceCents: getEffectivePriceCents(entry.product),
            quantity: entry.item.quantity,
            note: entry.item.note || null,
          })
          .$returningId();
        if (entry.options.length)
          await tx.insert(orderItemOptions).values(
            entry.options.map(option => ({
              orderItemId: createdItem.id,
              optionName: option.name,
              priceCents: option.priceCents,
            }))
          );
      }
      return { id: created.id, orderNumber };
    });

    const trackingUrl = `${origin}/pedido/${publicId}`;
    const itemLines = snapshots
      .map(
        entry =>
          `${entry.item.quantity}× ${entry.product.name}${entry.options.length ? ` (${entry.options.map(option => option.name).join(", ")})` : ""}`
      )
      .join("\n");
    const paymentLabel = {
      pix: "Pix",
      cash: "Dinheiro",
      card_delivery: "Cartão na entrega",
      card_pickup: "Cartão na retirada",
    }[input.paymentMethod];
    const address =
      input.deliveryType === "pickup"
        ? "Retirada na loja"
        : `${input.street}, ${input.streetNumber} — ${input.neighborhood}, ${input.city}`;
    const whatsappMessage = `Olá! Quero confirmar meu pedido ${order.orderNumber}.\n\n${itemLines}\n\nTotal: R$ ${(totalCents / 100).toFixed(2).replace(".", ",")}\nPagamento: ${paymentLabel}\nEntrega: ${address}\n\nAcompanhe: ${trackingUrl}`;
    return {
      ...order,
      publicId,
      totalCents,
      trackingUrl,
      whatsappUrl: buildWhatsAppLink(store.phone, whatsappMessage),
      whatsappMessage,
    };
  }),
  track: publicProcedure
    .input(z.object({ publicId: z.string().regex(/^[a-f0-9]{24}$/) }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [order] = await db
        .select({ order: orders, customer: customers })
        .from(orders)
        .innerJoin(customers, eq(orders.customerId, customers.id))
        .where(eq(orders.publicId, input.publicId))
        .limit(1);
      if (!order)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Não encontramos esse pedido.",
        });
      const [items, history] = await Promise.all([
        db
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, order.order.id)),
        db
          .select()
          .from(orderStatusHistory)
          .where(eq(orderStatusHistory.orderId, order.order.id))
          .orderBy(ascSafe(orderStatusHistory.createdAt)),
      ]);
      const itemIds = items.map(item => item.id);
      const options = itemIds.length
        ? await db
            .select()
            .from(orderItemOptions)
            .where(inArray(orderItemOptions.orderItemId, itemIds))
        : [];
      return {
        order: {
          id: order.order.id,
          publicId: order.order.publicId,
          orderNumber: order.order.orderNumber,
          deliveryType: order.order.deliveryType,
          status: order.order.status,
          paymentMethod: order.order.paymentMethod,
          subtotalCents: order.order.subtotalCents,
          deliveryFeeCents: order.order.deliveryFeeCents,
          totalCents: order.order.totalCents,
          neighborhood: order.order.neighborhood,
          createdAt: order.order.createdAt,
          updatedAt: order.order.updatedAt,
        },
        items: items.map(item => ({
          id: item.id,
          productName: item.productName,
          unitPriceCents: item.unitPriceCents,
          quantity: item.quantity,
          options: options
            .filter(option => option.orderItemId === item.id)
            .map(option => ({
              optionName: option.optionName,
              priceCents: option.priceCents,
            })),
        })),
        history: history.map(entry => ({
          status: entry.status,
          createdAt: entry.createdAt,
        })),
      };
    }),
  adminList: staffProcedure
    .input(
      z
        .object({
          status: z.enum(statusValues).optional(),
          view: z.enum(["active", "history"]).default("active"),
          page: z.number().int().min(0).max(100_000).default(0),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await requireDb();
      const view = input?.view ?? "active";
      const page = input?.page ?? 0;
      const pageSize = view === "history" ? 40 : 100;
      const cutoff = getOrderHistoryCutoff();
      const finalizedAt = sql`COALESCE(${orders.deliveredAt}, ${orders.updatedAt})`;
      const retentionFilter =
        view === "history"
          ? and(
              inArray(orders.status, [...COMPLETED_ORDER_STATUSES]),
              lt(finalizedAt, cutoff)
            )
          : or(
              notInArray(orders.status, [...COMPLETED_ORDER_STATUSES]),
              gte(finalizedAt, cutoff)
            );
      const query = db
        .select({
          order: orders,
          customer: customers,
          courier: {
            id: deliveryCouriers.id,
            name: deliveryCouriers.name,
            isActive: deliveryCouriers.isActive,
          },
        })
        .from(orders)
        .innerJoin(customers, eq(orders.customerId, customers.id))
        .leftJoin(deliveryCouriers, eq(orders.courierId, deliveryCouriers.id));
      const whereCondition = input?.status
        ? and(retentionFilter, eq(orders.status, input.status))
        : retentionFilter;
      const rows = await query
        .where(whereCondition)
        .orderBy(desc(view === "history" ? orders.updatedAt : orders.createdAt))
        .limit(pageSize + 1)
        .offset(page * pageSize);
      return {
        items: rows.slice(0, pageSize),
        hasMore: rows.length > pageSize,
      };
    }),
  adminDetail: staffProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [row] = await db
        .select({
          order: orders,
          customer: customers,
          courier: {
            id: deliveryCouriers.id,
            name: deliveryCouriers.name,
            phone: deliveryCouriers.phone,
            isActive: deliveryCouriers.isActive,
          },
        })
        .from(orders)
        .innerJoin(customers, eq(orders.customerId, customers.id))
        .leftJoin(deliveryCouriers, eq(orders.courierId, deliveryCouriers.id))
        .where(eq(orders.id, input.id))
        .limit(1);
      if (!row)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pedido não encontrado.",
        });
      const [items, history, storeRows, internalNotes] = await Promise.all([
        db.select().from(orderItems).where(eq(orderItems.orderId, input.id)),
        db
          .select()
          .from(orderStatusHistory)
          .where(eq(orderStatusHistory.orderId, input.id))
          .orderBy(desc(orderStatusHistory.createdAt)),
        db.select({ name: storeSettings.name }).from(storeSettings).limit(1),
        db
          .select()
          .from(orderInternalNotes)
          .where(eq(orderInternalNotes.orderId, input.id))
          .orderBy(
            asc(orderInternalNotes.createdAt),
            asc(orderInternalNotes.id)
          ),
      ]);
      const itemIds = items.map(item => item.id);
      const options = itemIds.length
        ? await db
            .select()
            .from(orderItemOptions)
            .where(inArray(orderItemOptions.orderItemId, itemIds))
        : [];
      return {
        ...row,
        storeName: storeRows[0]?.name || "Sua loja",
        items: items.map(item => ({
          ...item,
          options: options.filter(option => option.orderItemId === item.id),
        })),
        history,
        internalNotes,
      };
    }),
  adminUpdateStatus: staffProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(statusValues),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const result = await db.transaction(async tx => {
        const [current] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, input.id))
          .for("update")
          .limit(1);
        if (!current)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Pedido não encontrado.",
          });
        if (current.status === input.status)
          return { changed: false, order: current };
        if (
          input.status === "out_for_delivery" &&
          current.deliveryType !== "delivery"
        )
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Pedidos de retirada não podem ser enviados para entrega.",
          });
        if (!canTransitionOrder(current.status, input.status))
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Essa mudança de status não é permitida para o pedido.",
          });
        if (
          input.status === "out_for_delivery" &&
          current.status !== "out_for_delivery"
        ) {
          let hasActiveCourier = false;
          if (current.courierId) {
            const [courier] = await tx
              .select({ isActive: deliveryCouriers.isActive })
              .from(deliveryCouriers)
              .where(eq(deliveryCouriers.id, current.courierId))
              .limit(1);
            hasActiveCourier = Boolean(courier?.isActive);
          }
          if (!canDispatchDelivery(current.deliveryType, hasActiveCourier))
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message:
                "Atribua um entregador ativo antes de marcar o pedido como saiu para entrega.",
            });
        }
        const deliveredAt =
          input.status === "delivered" ? new Date() : current.deliveredAt;
        await tx
          .update(orders)
          .set({ status: input.status, deliveredAt })
          .where(eq(orders.id, input.id));
        await tx.insert(orderStatusHistory).values({
          orderId: input.id,
          status: input.status,
          note: statusLabels[input.status],
          changedBy: ctx.user.name || "Equipe da loja",
        });
        return { changed: true, order: current };
      });
      if (!result.changed) return { success: true, whatsappDelivered: false };
      const [customer] = await db
        .select({ phone: customers.phone })
        .from(customers)
        .innerJoin(orders, eq(customers.id, orders.customerId))
        .where(eq(orders.id, input.id))
        .limit(1);
      const messageResult = customer
        ? await notifyOrderStatus(
            result.order.orderNumber || String(result.order.id),
            customer.phone,
            input.status
          )
        : { delivered: false };
      return { success: true, whatsappDelivered: messageResult.delivered };
    }),
  assignCourier: staffProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        courierId: z.number().int().positive().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      return db.transaction(async tx => {
        let courierName: string | null = null;
        if (input.courierId !== null) {
          const [courier] = await tx
            .select({ id: deliveryCouriers.id, name: deliveryCouriers.name })
            .from(deliveryCouriers)
            .where(
              and(
                eq(deliveryCouriers.id, input.courierId),
                eq(deliveryCouriers.isActive, true)
              )
            )
            .limit(1)
            .for("update");
          if (!courier)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Entregador ativo não encontrado.",
            });
          courierName = courier.name;
        }
        const [current] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, input.id))
          .for("update")
          .limit(1);
        if (!current)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Pedido não encontrado.",
          });
        if (!canAssignCourier(current.status, current.deliveryType))
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Entregadores só podem ser atribuídos a pedidos de entrega prontos ou em rota.",
          });
        if (input.courierId === null && current.status !== "ready")
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Um pedido em rota precisa permanecer atribuído a um entregador.",
          });

        await tx
          .update(orders)
          .set({
            courierId: input.courierId,
            courierAssignedAt: input.courierId ? new Date() : null,
          })
          .where(eq(orders.id, input.id));
        await tx.insert(orderStatusHistory).values({
          orderId: input.id,
          status: current.status,
          note: input.courierId
            ? `Entregador atribuído: ${courierName}`
            : "Entregador removido do pedido",
          changedBy: ctx.user.name || "Equipe da loja",
        });
        return { success: true as const };
      });
    }),
  adminEdit: ownerEditProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        customerName: z
          .string()
          .trim()
          .min(2)
          .max(140)
          .refine(isFullName, "Informe nome e sobrenome."),
        phone: z
          .string()
          .trim()
          .max(32)
          .refine(
            isSupportedBrazilPhone,
            "Informe um telefone brasileiro com DDD."
          ),
        postalCode: z.string().trim().max(16),
        street: z.string().trim().max(180),
        streetNumber: z.string().trim().max(32),
        complement: z.string().trim().max(140),
        neighborhood: z.string().trim().max(120),
        city: z.string().trim().max(120),
        reference: z.string().trim().max(200),
        customerNote: z.string().trim().max(500),
        items: z
          .array(
            z.object({
              id: z.number().int().positive(),
              quantity: z.number().int().min(1).max(20),
              note: z.string().trim().max(500),
            })
          )
          .min(1)
          .max(50)
          .refine(
            lines => new Set(lines.map(line => line.id)).size === lines.length,
            "Itens duplicados não são permitidos."
          ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const phone = normalizeBrazilPhone(input.phone);
      return db.transaction(async tx => {
        const [current] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, input.id))
          .for("update")
          .limit(1);
        if (!current)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Pedido não encontrado.",
          });
        if (["delivered", "cancelled", "rejected"].includes(current.status))
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Pedidos concluídos ou encerrados não podem ser editados.",
          });
        if (
          current.deliveryType === "delivery" &&
          (!input.street ||
            !input.streetNumber ||
            !input.neighborhood ||
            !input.city)
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Informe o endereço completo para entrega.",
          });
        }
        if (
          current.deliveryType === "delivery" &&
          !isValidBrazilianCep(input.postalCode)
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Informe um CEP válido com oito dígitos para a entrega.",
          });
        }
        const [phoneOwner] = await tx
          .select({ id: customers.id })
          .from(customers)
          .where(eq(customers.phone, phone))
          .limit(1);
        if (phoneOwner && phoneOwner.id !== current.customerId)
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Esse telefone está associado a outro cadastro de cliente.",
          });
        const currentItems = await tx
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, input.id));
        const submittedIds = input.items
          .map(item => item.id)
          .sort((a, b) => a - b);
        const expectedIds = currentItems
          .map(item => item.id)
          .sort((a, b) => a - b);
        if (
          submittedIds.length !== expectedIds.length ||
          submittedIds.some((id, index) => id !== expectedIds[index])
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Atualize o pedido antes de editar: os itens mudaram.",
          });
        }
        const itemIds = currentItems.map(item => item.id);
        const options = itemIds.length
          ? await tx
              .select()
              .from(orderItemOptions)
              .where(inArray(orderItemOptions.orderItemId, itemIds))
          : [];
        let subtotalCents: number;
        try {
          subtotalCents = recalculateEditedSubtotal(
            currentItems.map(item => ({
              id: item.id,
              unitPriceCents: item.unitPriceCents,
              optionUnitCents: options
                .filter(option => option.orderItemId === item.id)
                .reduce((total, option) => total + option.priceCents, 0),
            })),
            input.items
          );
        } catch {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Não foi possível recalcular os itens. Atualize os dados e tente novamente.",
          });
        }
        const totalCents =
          subtotalCents + current.deliveryFeeCents - current.discountCents;
        if (
          !Number.isSafeInteger(totalCents) ||
          totalCents < 0 ||
          totalCents > 5_000_000
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "O total revisado excede o limite permitido.",
          });
        await tx
          .update(customers)
          .set({ name: input.customerName, phone })
          .where(eq(customers.id, current.customerId));
        await tx
          .update(orders)
          .set({
            postalCode: input.postalCode || null,
            street: input.street || null,
            streetNumber: input.streetNumber || null,
            complement: input.complement || null,
            neighborhood: input.neighborhood || null,
            city: input.city || null,
            reference: input.reference || null,
            customerNote: input.customerNote || null,
            subtotalCents,
            totalCents,
          })
          .where(eq(orders.id, input.id));
        for (const item of input.items)
          await tx
            .update(orderItems)
            .set({ quantity: item.quantity, note: item.note || null })
            .where(
              and(eq(orderItems.id, item.id), eq(orderItems.orderId, input.id))
            );
        await tx.insert(orderStatusHistory).values({
          orderId: input.id,
          status: current.status,
          note: "Pedido editado pela equipe da loja",
          changedBy: ctx.user.name || "Equipe da loja",
        });
        const messageItems = currentItems.map(item => {
          const edited = input.items.find(line => line.id === item.id)!;
          const itemOptions = options.filter(
            option => option.orderItemId === item.id
          );
          const suffix = itemOptions.length
            ? ` (${itemOptions.map(option => option.optionName).join(", ")})`
            : "";
          return `${edited.quantity}× ${item.productName}${suffix}`;
        });
        const address =
          current.deliveryType === "pickup"
            ? "Retirada na loja"
            : `${input.street}, ${input.streetNumber} — ${input.neighborhood}, ${input.city}`;
        const message = `Olá, ${input.customerName.split(/\s+/)[0]}! O pedido ${current.orderNumber || `#${current.id}`} foi atualizado pela loja.\n\n${messageItems.join("\n")}\n\nNovo total: ${formatBRL(totalCents)}\n${address}${input.reference ? `\nReferência: ${input.reference}` : ""}\n\nSe precisar, fale conosco por aqui.`;
        return {
          success: true,
          subtotalCents,
          totalCents,
          whatsappUrl: buildWhatsAppLink(phone, message),
          whatsappMessage: message,
        };
      });
    }),
  adminNote: staffProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        note: z.string().trim().min(1).max(500),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [existing] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.id, input.id))
        .limit(1);
      if (!existing)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pedido não encontrado.",
        });
      await db.insert(orderInternalNotes).values({
        orderId: input.id,
        authorName: ctx.user.name || "Equipe da loja",
        note: input.note,
      });
      return { success: true } as const;
    }),
  adminStats: adminProcedure.query(async () => {
    const db = await requireDb();
    const [store] = await db
      .select({ timeZone: storeSettings.timeZone })
      .from(storeSettings)
      .limit(1);
    const timeZone = store?.timeZone || "America/Sao_Paulo";
    const [rows, revenueRows] = await Promise.all([
      db
        .select({ status: orders.status, total: sql<number>`count(*)` })
        .from(orders)
        .groupBy(orders.status),
      (async () => {
        const { start, end } = businessDayBounds(new Date(), timeZone);
        return db
          .select({
            revenue: sql<number>`coalesce(sum(${orders.totalCents}), 0)`,
          })
          .from(orders)
          .where(
            and(
              eq(orders.status, "delivered"),
              gte(orders.deliveredAt, start),
              lt(orders.deliveredAt, end)
            )
          );
      })(),
    ]);
    return {
      counts: Object.fromEntries(
        rows.map(row => [row.status, Number(row.total)])
      ),
      revenueTodayCents: Number(revenueRows[0]?.revenue ?? 0),
      timeZone,
    };
  }),
  adminSales: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [store] = await db
        .select({ timeZone: storeSettings.timeZone })
        .from(storeSettings)
        .limit(1);
      const timeZone = store?.timeZone || "America/Sao_Paulo";
      const { start, end } = businessDayRange(new Date(), timeZone, input.days);
      const completed = await db
        .select({
          deliveredAt: orders.deliveredAt,
          totalCents: orders.totalCents,
        })
        .from(orders)
        .where(
          and(
            eq(orders.status, "delivered"),
            gte(orders.deliveredAt, start),
            lt(orders.deliveredAt, end)
          )
        );
      const daily = new Map<
        string,
        { date: string; orders: number; revenueCents: number }
      >();
      for (const order of completed) {
        if (!order.deliveredAt) continue;
        const date = businessDateKey(order.deliveredAt, timeZone);
        const current = daily.get(date) ?? { date, orders: 0, revenueCents: 0 };
        current.orders += 1;
        current.revenueCents += order.totalCents;
        daily.set(date, current);
      }
      const series = Array.from(daily.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
      );
      const orderCount = series.reduce((sum, day) => sum + day.orders, 0);
      const revenueCents = series.reduce(
        (sum, day) => sum + day.revenueCents,
        0
      );
      return {
        series,
        orderCount,
        revenueCents,
        averageTicketCents: orderCount
          ? Math.round(revenueCents / orderCount)
          : 0,
        timeZone,
        days: input.days,
      };
    }),
});

function ascSafe(column: typeof orderStatusHistory.createdAt) {
  return column;
}
