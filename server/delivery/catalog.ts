import { TRPCError } from "@trpc/server";
import { and, asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { categories, productOptions, products, storeSettings } from "../../drizzle/schema.js";
import { adminProcedure, requireDb } from "./shared.js";
import { publicProcedure, router } from "../_core/trpc.js";
import { isSupportedBrazilPhone, normalizeBrazilPhone } from "../phone.js";

const optionInput = z.object({ name: z.string().trim().min(1).max(120), priceCents: z.number().int().min(0).max(100000), isAvailable: z.boolean().default(true) });
const productFields = z.object({
  categoryId: z.number().int().positive(), name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).default(""), imageUrl: z.string().trim().max(1000).refine(isSafeImageReference, "Use uma imagem local ou URL HTTPS.").default(""),
  priceCents: z.number().int().min(1).max(500000), isAvailable: z.boolean().default(true),
  isFeatured: z.boolean().default(false), sortOrder: z.number().int().default(0), options: z.array(optionInput).max(20).default([]),
});
const paymentMethodValues = ["pix", "cash", "card_delivery", "card_pickup"] as const;
function isSafeImageReference(value: string): boolean {
  if (!value) return true;
  if (/^\/(?!\/)[a-zA-Z0-9_./~-]+$/.test(value)) return true;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export const catalogRouter = router({
  home: publicProcedure.query(async () => {
    const db = await requireDb();
    const [storeRows, categoryRows, productRows, optionRows] = await Promise.all([
      db.select().from(storeSettings).limit(1),
      db.select().from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.sortOrder)),
      db.select().from(products).where(eq(products.isAvailable, true)).orderBy(asc(products.categoryId), asc(products.sortOrder)),
      db.select().from(productOptions).where(eq(productOptions.isAvailable, true)),
    ]);
    let paymentMethods: typeof paymentMethodValues[number][] = ["pix", "cash", "card_delivery", "card_pickup"];
    try {
      const parsed = JSON.parse(storeRows[0]?.paymentMethods ?? "[]");
      if (Array.isArray(parsed) && parsed.every(value => paymentMethodValues.includes(value))) paymentMethods = parsed;
    } catch { /* keep template defaults */ }
    return { store: storeRows[0] ?? null, paymentMethods, categories: categoryRows, products: productRows, options: optionRows };
  }),
  adminData: adminProcedure.query(async () => {
    const db = await requireDb();
    const [categoryRows, productRows, optionRows, storeRows] = await Promise.all([
      db.select().from(categories).orderBy(asc(categories.sortOrder)),
      db.select().from(products).orderBy(asc(products.categoryId), asc(products.sortOrder)),
      db.select().from(productOptions),
      db.select().from(storeSettings).limit(1),
    ]);
    let paymentMethods: typeof paymentMethodValues[number][] = ["pix", "cash", "card_delivery", "card_pickup"];
    try {
      const parsed = JSON.parse(storeRows[0]?.paymentMethods ?? "[]");
      if (Array.isArray(parsed) && parsed.every(value => paymentMethodValues.includes(value))) paymentMethods = parsed;
    } catch { /* keep template defaults */ }
    return { categories: categoryRows, products: productRows, options: optionRows, store: storeRows[0] ?? null, paymentMethods };
  }),
  categoryCreate: adminProcedure.input(z.object({ name: z.string().trim().min(2).max(120) })).mutation(async ({ input }) => {
    const db = await requireDb();
    const slugBase = input.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    await db.insert(categories).values({ name: input.name, slug: `${slugBase}-${Date.now().toString(36)}` });
    return { success: true };
  }),
  categoryUpdate: adminProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(2).max(120), sortOrder: z.number().int().min(0).max(999) })).mutation(async ({ input }) => {
    const db = await requireDb();
    await db.update(categories).set({ name: input.name, sortOrder: input.sortOrder }).where(eq(categories.id, input.id));
    return { success: true };
  }),
  categoryToggle: adminProcedure.input(z.object({ id: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ input }) => {
    const db = await requireDb();
    await db.update(categories).set({ isActive: input.isActive }).where(eq(categories.id, input.id));
    return { success: true };
  }),
  categoryDelete: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
    const db = await requireDb();
    const [usage] = await db.select({ total: count() }).from(products).where(eq(products.categoryId, input.id));
    if (usage && usage.total > 0) throw new TRPCError({ code: "CONFLICT", message: "Mova ou exclua os produtos antes de remover esta categoria." });
    await db.delete(categories).where(eq(categories.id, input.id));
    return { success: true };
  }),
  productCreate: adminProcedure.input(productFields).mutation(async ({ input }) => {
    const db = await requireDb();
    return db.transaction(async tx => {
      const [created] = await tx.insert(products).values({ ...input, imageUrl: input.imageUrl || null }).$returningId();
      if (input.options.length) await tx.insert(productOptions).values(input.options.map(option => ({ ...option, productId: created.id })));
      return { id: created.id };
    });
  }),
  productUpdate: adminProcedure.input(productFields.extend({ id: z.number().int().positive() })).mutation(async ({ input }) => {
    const db = await requireDb();
    const { id, options, ...fields } = input;
    return db.transaction(async tx => {
      await tx.update(products).set({ ...fields, imageUrl: fields.imageUrl || null }).where(eq(products.id, id));
      await tx.delete(productOptions).where(eq(productOptions.productId, id));
      if (options.length) await tx.insert(productOptions).values(options.map(option => ({ ...option, productId: id })));
      return { success: true };
    });
  }),
  productAvailability: adminProcedure.input(z.object({ id: z.number().int().positive(), isAvailable: z.boolean() })).mutation(async ({ input }) => {
    const db = await requireDb();
    await db.update(products).set({ isAvailable: input.isAvailable }).where(eq(products.id, input.id));
    return { success: true };
  }),
  productDelete: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
    const db = await requireDb();
    await db.delete(products).where(eq(products.id, input.id));
    return { success: true };
  }),
  storeUpdate: adminProcedure.input(z.object({
    name: z.string().trim().min(2).max(140), tagline: z.string().trim().max(240), phone: z.string().trim().max(32).refine(isSupportedBrazilPhone, "Informe um telefone brasileiro com DDD."),
    address: z.string().trim().max(240), logoUrl: z.string().trim().max(1000).refine(isSafeImageReference, "Use uma imagem local ou URL HTTPS."),
    bannerUrl: z.string().trim().max(1000).refine(isSafeImageReference, "Use uma imagem local ou URL HTTPS."),
    brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/), timeZone: z.string().trim().min(1).max(64),
    businessHours: z.string().trim().max(500), paymentMethods: z.array(z.enum(paymentMethodValues)).min(1).max(paymentMethodValues.length),
    averageDeliveryMinutes: z.number().int().min(5).max(240), deliveryFeeCents: z.number().int().min(0).max(50000),
    minimumOrderCents: z.number().int().min(0).max(50000), isOpen: z.boolean(), closedMessage: z.string().trim().max(200),
  })).mutation(async ({ input }) => {
    try { new Intl.DateTimeFormat("pt-BR", { timeZone: input.timeZone }).format(new Date()); }
    catch { throw new TRPCError({ code: "BAD_REQUEST", message: "Fuso horário inválido." }); }
    const db = await requireDb();
    const [existing] = await db.select({ id: storeSettings.id }).from(storeSettings).limit(1);
    const { paymentMethods, ...settings } = input;
    const values = { ...settings, phone: normalizeBrazilPhone(settings.phone), paymentMethods: JSON.stringify(paymentMethods) };
    if (existing) await db.update(storeSettings).set(values).where(eq(storeSettings.id, existing.id));
    else await db.insert(storeSettings).values(values);
    return { success: true };
  }),
});
