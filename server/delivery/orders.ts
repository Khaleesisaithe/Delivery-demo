import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { customers, orderItemOptions, orderItems, orderStatusHistory, orders, productOptions, products, storeSettings } from "../../drizzle/schema";
import { buildWhatsAppLink, notifyOrderStatus } from "../whatsapp";
import { adminProcedure, staffProcedure, requireDb, statusLabels } from "./shared";
import { businessDateKey, businessDayBounds, businessDayRange } from "./businessDay";
import { canTransitionOrder } from "./workflow";
import { recalculateEditedSubtotal } from "./orderEditing";
import { isSupportedBrazilPhone, normalizeBrazilPhone } from "../phone";
import { publicProcedure, router } from "../_core/trpc";

const statusValues = Object.keys(statusLabels) as [keyof typeof statusLabels, ...(keyof typeof statusLabels)[]];
const orderInput = z.object({
  customerName: z.string().trim().min(2).max(140), phone: z.string().trim().max(32).refine(isSupportedBrazilPhone, "Informe um telefone brasileiro com DDD."),
  deliveryType: z.enum(["delivery", "pickup"]), paymentMethod: z.enum(["pix", "cash", "card_delivery", "card_pickup"]),
  changeForCents: z.number().int().min(0).nullable().optional(),
  postalCode: z.string().trim().max(16).optional(), street: z.string().trim().max(180).optional(), streetNumber: z.string().trim().max(32).optional(),
  complement: z.string().trim().max(140).optional(), neighborhood: z.string().trim().max(120).optional(), city: z.string().trim().max(120).optional(),
  reference: z.string().trim().max(200).optional(), customerNote: z.string().trim().max(500).optional(),
  items: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(1).max(20), optionIds: z.array(z.number().int().positive()).max(20).refine(ids => new Set(ids).size === ids.length, "Adicionais duplicados não são permitidos."), note: z.string().trim().max(500).optional() })).min(1).max(50),
});

export const ordersRouter = router({
  create: publicProcedure.input(orderInput).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const [store] = await db.select().from(storeSettings).limit(1);
    if (!store) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A loja ainda não foi configurada." });
    if (!store.isOpen) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A loja está fechada no momento." });
    let paymentMethods: string[];
    try { paymentMethods = JSON.parse(store.paymentMethods || "[]"); } catch { paymentMethods = []; }
    if (!paymentMethods.includes(input.paymentMethod)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Essa forma de pagamento não está disponível." });
    if (input.deliveryType === "delivery" && (!input.street || !input.streetNumber || !input.neighborhood || !input.city)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o endereço completo para entrega." });
    }
    if (input.deliveryType === "pickup" && input.paymentMethod === "card_delivery") throw new TRPCError({ code: "BAD_REQUEST", message: "Cartão na entrega só está disponível para pedidos de entrega." });
    if (input.deliveryType === "delivery" && input.paymentMethod === "card_pickup") throw new TRPCError({ code: "BAD_REQUEST", message: "Cartão na retirada só está disponível para retirada." });
    if (input.paymentMethod !== "cash" && input.changeForCents) throw new TRPCError({ code: "BAD_REQUEST", message: "Troco só pode ser informado para pagamento em dinheiro." });

    const uniqueProductIds = Array.from(new Set(input.items.map(item => item.productId)));
    const uniqueOptionIds = Array.from(new Set(input.items.flatMap(item => item.optionIds)));
    const productRows = await db.select().from(products).where(inArray(products.id, uniqueProductIds));
    const optionRows = uniqueOptionIds.length ? await db.select().from(productOptions).where(and(inArray(productOptions.id, uniqueOptionIds), eq(productOptions.isAvailable, true))) : [];
    const productById = new Map(productRows.map(item => [item.id, item]));
    const optionById = new Map(optionRows.map(item => [item.id, item]));
    const snapshots = input.items.map(item => {
      const product = productById.get(item.productId);
      if (!product || !product.isAvailable) throw new TRPCError({ code: "CONFLICT", message: "Um produto do carrinho ficou indisponível. Atualize seu pedido." });
      const chosen = item.optionIds.map(id => optionById.get(id));
      if (chosen.some(option => !option || option.productId !== item.productId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Um adicional selecionado não pertence a este produto." });
      const options = chosen.filter((option): option is NonNullable<typeof option> => Boolean(option));
      return { item, product, options, unitPriceCents: product.priceCents + options.reduce((sum, option) => sum + option.priceCents, 0) };
    });
    const subtotalCents = snapshots.reduce((sum, entry) => sum + entry.unitPriceCents * entry.item.quantity, 0);
    if (!Number.isSafeInteger(subtotalCents) || subtotalCents > 5_000_000) throw new TRPCError({ code: "BAD_REQUEST", message: "O valor total do pedido excede o limite permitido." });
    if (input.deliveryType === "delivery" && subtotalCents < store.minimumOrderCents) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: `O pedido mínimo é R$ ${(store.minimumOrderCents / 100).toFixed(2).replace(".", ",")}.` });
    }
    const deliveryFeeCents = input.deliveryType === "delivery" ? store.deliveryFeeCents : 0;
    const totalCents = subtotalCents + deliveryFeeCents;
    if (input.paymentMethod === "cash" && input.changeForCents !== null && input.changeForCents !== undefined && input.changeForCents < totalCents) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "O valor informado para troco precisa cobrir o total do pedido." });
    }
    const publicId = randomBytes(12).toString("hex");
    const phone = normalizeBrazilPhone(input.phone);
    const origin = process.env.APP_URL || ctx.req.get("origin") || `${ctx.req.protocol}://${ctx.req.get("host")}`;

    const order = await db.transaction(async tx => {
      await tx.insert(customers).values({ name: input.customerName, phone }).onDuplicateKeyUpdate({ set: { name: input.customerName } });
      const [customer] = await tx.select().from(customers).where(eq(customers.phone, phone)).limit(1);
      if (!customer) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível salvar os dados do cliente." });
      const [created] = await tx.insert(orders).values({
        publicId, orderNumber: null, customerId: customer.id, deliveryType: input.deliveryType, status: "received", paymentMethod: input.paymentMethod,
        changeForCents: input.changeForCents ?? null, subtotalCents, deliveryFeeCents, discountCents: 0, totalCents,
        postalCode: input.postalCode || null, street: input.street || null, streetNumber: input.streetNumber || null, complement: input.complement || null,
        neighborhood: input.neighborhood || null, city: input.city || null, reference: input.reference || null, customerNote: input.customerNote || null,
      }).$returningId();
      const orderNumber = `BP-${String(created.id).padStart(5, "0")}`;
      await tx.update(orders).set({ orderNumber }).where(eq(orders.id, created.id));
      await tx.insert(orderStatusHistory).values({ orderId: created.id, status: "received", note: "Pedido realizado pelo site", changedBy: input.customerName });
      for (const entry of snapshots) {
        const [createdItem] = await tx.insert(orderItems).values({
          orderId: created.id, productId: entry.product.id, productName: entry.product.name,
          unitPriceCents: entry.product.priceCents, quantity: entry.item.quantity, note: entry.item.note || null,
        }).$returningId();
        if (entry.options.length) await tx.insert(orderItemOptions).values(entry.options.map(option => ({ orderItemId: createdItem.id, optionName: option.name, priceCents: option.priceCents })));
      }
      return { id: created.id, orderNumber };
    });

    const trackingUrl = `${origin}/pedido/${publicId}`;
    const itemLines = snapshots.map(entry => `${entry.item.quantity}× ${entry.product.name}${entry.options.length ? ` (${entry.options.map(option => option.name).join(", ")})` : ""}`).join("\n");
    const paymentLabel = { pix: "Pix", cash: "Dinheiro", card_delivery: "Cartão na entrega", card_pickup: "Cartão na retirada" }[input.paymentMethod];
    const address = input.deliveryType === "pickup" ? "Retirada na loja" : `${input.street}, ${input.streetNumber} — ${input.neighborhood}, ${input.city}`;
    const whatsappMessage = `Olá! Quero confirmar meu pedido ${order.orderNumber}.\n\n${itemLines}\n\nTotal: R$ ${(totalCents / 100).toFixed(2).replace(".", ",")}\nPagamento: ${paymentLabel}\nEntrega: ${address}\n\nAcompanhe: ${trackingUrl}`;
    return { ...order, publicId, totalCents, trackingUrl, whatsappUrl: buildWhatsAppLink(store.phone, whatsappMessage), whatsappMessage };
  }),
  track: publicProcedure.input(z.object({ publicId: z.string().regex(/^[a-f0-9]{24}$/) })).query(async ({ input }) => {
    const db = await requireDb();
    const [order] = await db.select({ order: orders, customer: customers }).from(orders).innerJoin(customers, eq(orders.customerId, customers.id)).where(eq(orders.publicId, input.publicId)).limit(1);
    if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Não encontramos esse pedido." });
    const [items, history] = await Promise.all([
      db.select().from(orderItems).where(eq(orderItems.orderId, order.order.id)),
      db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, order.order.id)).orderBy(ascSafe(orderStatusHistory.createdAt)),
    ]);
    const itemIds = items.map(item => item.id);
    const options = itemIds.length ? await db.select().from(orderItemOptions).where(inArray(orderItemOptions.orderItemId, itemIds)) : [];
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
      items: items.map(item => ({ id: item.id, productName: item.productName, unitPriceCents: item.unitPriceCents, quantity: item.quantity, options: options.filter(option => option.orderItemId === item.id).map(option => ({ optionName: option.optionName, priceCents: option.priceCents })) })),
      history: history.map(entry => ({ status: entry.status, createdAt: entry.createdAt })),
    };
  }),
  adminList: staffProcedure.input(z.object({ status: z.enum(statusValues).optional() }).optional()).query(async ({ input }) => {
    const db = await requireDb();
    const query = db.select({ order: orders, customer: customers }).from(orders).innerJoin(customers, eq(orders.customerId, customers.id));
    const rows = input?.status ? await query.where(eq(orders.status, input.status)).orderBy(desc(orders.createdAt)).limit(100) : await query.orderBy(desc(orders.createdAt)).limit(100);
    return rows;
  }),
  adminDetail: staffProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
    const db = await requireDb();
    const [row] = await db.select({ order: orders, customer: customers }).from(orders).innerJoin(customers, eq(orders.customerId, customers.id)).where(eq(orders.id, input.id)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
    const [items, history, storeRows] = await Promise.all([
      db.select().from(orderItems).where(eq(orderItems.orderId, input.id)),
      db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, input.id)).orderBy(desc(orderStatusHistory.createdAt)),
      db.select({ name: storeSettings.name }).from(storeSettings).limit(1),
    ]);
    const itemIds = items.map(item => item.id);
    const options = itemIds.length ? await db.select().from(orderItemOptions).where(inArray(orderItemOptions.orderItemId, itemIds)) : [];
    return { ...row, storeName: storeRows[0]?.name || "Sua loja", items: items.map(item => ({ ...item, options: options.filter(option => option.orderItemId === item.id) })), history };
  }),
  adminUpdateStatus: staffProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(statusValues) })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const result = await db.transaction(async tx => {
      const [current] = await tx.select().from(orders).where(eq(orders.id, input.id)).for("update").limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
      if (current.status === input.status) return { changed: false, order: current };
      if (!canTransitionOrder(current.status, input.status)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Essa mudança de status não é permitida para o pedido." });
      const deliveredAt = input.status === "delivered" ? new Date() : current.deliveredAt;
      await tx.update(orders).set({ status: input.status, deliveredAt }).where(eq(orders.id, input.id));
      await tx.insert(orderStatusHistory).values({ orderId: input.id, status: input.status, note: statusLabels[input.status], changedBy: ctx.user.name || "Equipe da loja" });
      return { changed: true, order: current };
    });
    if (!result.changed) return { success: true, whatsappDelivered: false };
    const [customer] = await db.select({ phone: customers.phone }).from(customers).innerJoin(orders, eq(customers.id, orders.customerId)).where(eq(orders.id, input.id)).limit(1);
    const messageResult = customer ? await notifyOrderStatus(result.order.orderNumber || String(result.order.id), customer.phone, input.status) : { delivered: false };
    return { success: true, whatsappDelivered: messageResult.delivered };
  }),
  adminEdit: staffProcedure.input(z.object({
    id: z.number().int().positive(), customerName: z.string().trim().min(2).max(140),
    phone: z.string().trim().max(32).refine(isSupportedBrazilPhone, "Informe um telefone brasileiro com DDD."),
    postalCode: z.string().trim().max(16), street: z.string().trim().max(180), streetNumber: z.string().trim().max(32),
    complement: z.string().trim().max(140), neighborhood: z.string().trim().max(120), city: z.string().trim().max(120),
    reference: z.string().trim().max(200), customerNote: z.string().trim().max(500),
    items: z.array(z.object({ id: z.number().int().positive(), quantity: z.number().int().min(1).max(20), note: z.string().trim().max(500) })).min(1).max(50)
      .refine(lines => new Set(lines.map(line => line.id)).size === lines.length, "Itens duplicados não são permitidos."),
  })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const phone = normalizeBrazilPhone(input.phone);
    return db.transaction(async tx => {
      const [current] = await tx.select().from(orders).where(eq(orders.id, input.id)).for("update").limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
      if (["delivered", "cancelled", "rejected"].includes(current.status)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Pedidos concluídos ou encerrados não podem ser editados." });
      if (current.deliveryType === "delivery" && (!input.street || !input.streetNumber || !input.neighborhood || !input.city)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o endereço completo para entrega." });
      }
      const [phoneOwner] = await tx.select({ id: customers.id }).from(customers).where(eq(customers.phone, phone)).limit(1);
      if (phoneOwner && phoneOwner.id !== current.customerId) throw new TRPCError({ code: "CONFLICT", message: "Esse telefone está associado a outro cadastro de cliente." });
      const currentItems = await tx.select().from(orderItems).where(eq(orderItems.orderId, input.id));
      const submittedIds = input.items.map(item => item.id).sort((a, b) => a - b);
      const expectedIds = currentItems.map(item => item.id).sort((a, b) => a - b);
      if (submittedIds.length !== expectedIds.length || submittedIds.some((id, index) => id !== expectedIds[index])) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Atualize o pedido antes de editar: os itens mudaram." });
      }
      const itemIds = currentItems.map(item => item.id);
      const options = itemIds.length ? await tx.select().from(orderItemOptions).where(inArray(orderItemOptions.orderItemId, itemIds)) : [];
      let subtotalCents: number;
      try {
        subtotalCents = recalculateEditedSubtotal(currentItems.map(item => ({ id: item.id, unitPriceCents: item.unitPriceCents, optionUnitCents: options.filter(option => option.orderItemId === item.id).reduce((total, option) => total + option.priceCents, 0) })), input.items);
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível recalcular os itens. Atualize os dados e tente novamente." });
      }
      const totalCents = subtotalCents + current.deliveryFeeCents - current.discountCents;
      if (!Number.isSafeInteger(totalCents) || totalCents < 0 || totalCents > 5_000_000) throw new TRPCError({ code: "BAD_REQUEST", message: "O total revisado excede o limite permitido." });
      await tx.update(customers).set({ name: input.customerName, phone }).where(eq(customers.id, current.customerId));
      await tx.update(orders).set({ postalCode: input.postalCode || null, street: input.street || null, streetNumber: input.streetNumber || null, complement: input.complement || null, neighborhood: input.neighborhood || null, city: input.city || null, reference: input.reference || null, customerNote: input.customerNote || null, subtotalCents, totalCents }).where(eq(orders.id, input.id));
      for (const item of input.items) await tx.update(orderItems).set({ quantity: item.quantity, note: item.note || null }).where(and(eq(orderItems.id, item.id), eq(orderItems.orderId, input.id)));
      await tx.insert(orderStatusHistory).values({ orderId: input.id, status: current.status, note: "Pedido editado pela equipe da loja", changedBy: ctx.user.name || "Equipe da loja" });
      return { success: true, subtotalCents, totalCents };
    });
  }),
  adminNote: staffProcedure.input(z.object({ id: z.number().int().positive(), internalNote: z.string().trim().max(500) })).mutation(async ({ input }) => {
    const db = await requireDb();
    await db.update(orders).set({ internalNote: input.internalNote || null }).where(eq(orders.id, input.id));
    return { success: true };
  }),
  adminStats: adminProcedure.query(async () => {
    const db = await requireDb();
    const [store] = await db.select({ timeZone: storeSettings.timeZone }).from(storeSettings).limit(1);
    const timeZone = store?.timeZone || "America/Sao_Paulo";
    const [rows, revenueRows] = await Promise.all([
      db.select({ status: orders.status, total: sql<number>`count(*)` }).from(orders).groupBy(orders.status),
      (async () => {
        const { start, end } = businessDayBounds(new Date(), timeZone);
        return db.select({ revenue: sql<number>`coalesce(sum(${orders.totalCents}), 0)` }).from(orders).where(and(eq(orders.status, "delivered"), gte(orders.deliveredAt, start), lt(orders.deliveredAt, end)));
      })(),
    ]);
    return { counts: Object.fromEntries(rows.map(row => [row.status, Number(row.total)])), revenueTodayCents: Number(revenueRows[0]?.revenue ?? 0), timeZone };
  }),
  adminSales: adminProcedure.input(z.object({ days: z.number().int().min(1).max(90).default(30) })).query(async ({ input }) => {
    const db = await requireDb();
    const [store] = await db.select({ timeZone: storeSettings.timeZone }).from(storeSettings).limit(1);
    const timeZone = store?.timeZone || "America/Sao_Paulo";
    const { start, end } = businessDayRange(new Date(), timeZone, input.days);
    const completed = await db.select({ deliveredAt: orders.deliveredAt, totalCents: orders.totalCents }).from(orders).where(and(eq(orders.status, "delivered"), gte(orders.deliveredAt, start), lt(orders.deliveredAt, end)));
    const daily = new Map<string, { date: string; orders: number; revenueCents: number }>();
    for (const order of completed) {
      if (!order.deliveredAt) continue;
      const date = businessDateKey(order.deliveredAt, timeZone);
      const current = daily.get(date) ?? { date, orders: 0, revenueCents: 0 };
      current.orders += 1;
      current.revenueCents += order.totalCents;
      daily.set(date, current);
    }
    const series = Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date));
    const orderCount = series.reduce((sum, day) => sum + day.orders, 0);
    const revenueCents = series.reduce((sum, day) => sum + day.revenueCents, 0);
    return { series, orderCount, revenueCents, averageTicketCents: orderCount ? Math.round(revenueCents / orderCount) : 0, timeZone, days: input.days };
  }),
});

function ascSafe(column: typeof orderStatusHistory.createdAt) {
  return column;
}
