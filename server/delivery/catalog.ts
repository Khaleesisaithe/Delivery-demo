import { TRPCError } from "@trpc/server";
import { and, asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import {
  categories,
  productOptions,
  products,
  storeSettings,
} from "../../drizzle/schema.js";
import { adminProcedure, requireDb } from "./shared.js";
import { publicProcedure, router } from "../_core/trpc.js";
import { isSupportedBrazilPhone, normalizeBrazilPhone } from "../phone.js";

const optionInput = z.object({
  name: z.string().trim().min(1).max(120),
  priceCents: z.number().int().min(0).max(100000),
  isAvailable: z.boolean().default(true),
});
const productFieldsBase = z.object({
  categoryId: z.number().int().positive(),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).default(""),
  imageUrl: z
    .string()
    .trim()
    .max(1000)
    .refine(isSafeImageReference, "Use uma imagem local ou URL HTTPS.")
    .default(""),
  priceCents: z.number().int().min(1).max(500000),
  isPromotion: z.boolean().default(false),
  promotionPriceCents: z
    .number()
    .int()
    .min(1)
    .max(499999)
    .nullable()
    .default(null),
  isAvailable: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  options: z.array(optionInput).max(20).default([]),
});
function validatePromotion(
  product: z.infer<typeof productFieldsBase>,
  context: z.RefinementCtx
) {
  if (
    product.isPromotion &&
    (!product.promotionPriceCents ||
      product.promotionPriceCents >= product.priceCents)
  ) {
    context.addIssue({
      code: "custom",
      path: ["promotionPriceCents"],
      message: "O preço promocional deve ser menor que o preço normal.",
    });
  }
  if (!product.isPromotion && product.promotionPriceCents !== null) {
    context.addIssue({
      code: "custom",
      path: ["promotionPriceCents"],
      message: "Desative a promoção ou informe um preço promocional.",
    });
  }
}
const productFields = productFieldsBase.superRefine(validatePromotion);
const paymentMethodValues = [
  "pix",
  "cash",
  "card_delivery",
  "card_pickup",
] as const;
function isSafeImageReference(value: string): boolean {
  if (!value) return true;
  if (/^\/(?!\/)[a-zA-Z0-9_./~-]+$/.test(value)) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export const catalogRouter = router({
  lookupCep: publicProcedure
    .input(
      z.object({
        cep: z
          .string()
          .regex(/^\d{5}-?\d{3}$/, "Informe um CEP com oito dígitos."),
      })
    )
    .mutation(async ({ input }) => {
      const cep = input.cep.replace(/\D/g, "");
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
        signal: AbortSignal.timeout(5_000),
      }).catch(() => null);
      if (!response)
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message:
            "Não foi possível consultar o CEP. Você ainda pode preencher o endereço manualmente.",
        });
      if (!response.ok)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "O serviço de CEP não aceitou este número. Confira o CEP e tente novamente.",
        });
      const result = (await response.json()) as {
        erro?: boolean;
        cep?: string;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (result.erro || !result.cep)
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "CEP não encontrado. Confira o número ou preencha o endereço manualmente.",
        });
      return {
        cep: result.cep,
        street: result.logradouro || "",
        neighborhood: result.bairro || "",
        city: [result.localidade, result.uf].filter(Boolean).join(" - "),
      };
    }),
  home: publicProcedure.query(async () => {
    const db = await requireDb();
    const [storeRows, categoryRows, productRows, optionRows] =
      await Promise.all([
        db.select().from(storeSettings).limit(1),
        db
          .select()
          .from(categories)
          .where(eq(categories.isActive, true))
          .orderBy(asc(categories.sortOrder)),
        db
          .select()
          .from(products)
          .where(eq(products.isAvailable, true))
          .orderBy(asc(products.categoryId), asc(products.sortOrder)),
        db
          .select()
          .from(productOptions)
          .where(eq(productOptions.isAvailable, true)),
      ]);
    let paymentMethods: (typeof paymentMethodValues)[number][] = [
      "pix",
      "cash",
      "card_delivery",
      "card_pickup",
    ];
    try {
      const parsed = JSON.parse(storeRows[0]?.paymentMethods ?? "[]");
      if (
        Array.isArray(parsed) &&
        parsed.every(value => paymentMethodValues.includes(value))
      )
        paymentMethods = parsed;
    } catch {
      /* keep template defaults */
    }
    const activeCategoryIds = new Set(
      categoryRows.map(category => category.id)
    );
    const settings = storeRows[0];
    const paused = Boolean(
      settings?.pauseUntil &&
        new Date(settings.pauseUntil).getTime() > Date.now()
    );
    const store = settings
      ? {
          ...settings,
          isOpen: settings.isOpen && !paused,
          pauseUntil: paused ? settings.pauseUntil : null,
        }
      : null;
    return {
      store,
      paymentMethods,
      categories: categoryRows,
      products: productRows.filter(product =>
        activeCategoryIds.has(product.categoryId)
      ),
      options: optionRows,
    };
  }),
  adminData: adminProcedure.query(async () => {
    const db = await requireDb();
    const [categoryRows, productRows, optionRows, storeRows] =
      await Promise.all([
        db.select().from(categories).orderBy(asc(categories.sortOrder)),
        db
          .select()
          .from(products)
          .orderBy(asc(products.categoryId), asc(products.sortOrder)),
        db.select().from(productOptions),
        db.select().from(storeSettings).limit(1),
      ]);
    let paymentMethods: (typeof paymentMethodValues)[number][] = [
      "pix",
      "cash",
      "card_delivery",
      "card_pickup",
    ];
    try {
      const parsed = JSON.parse(storeRows[0]?.paymentMethods ?? "[]");
      if (
        Array.isArray(parsed) &&
        parsed.every(value => paymentMethodValues.includes(value))
      )
        paymentMethods = parsed;
    } catch {
      /* keep template defaults */
    }
    return {
      categories: categoryRows,
      products: productRows,
      options: optionRows,
      store: storeRows[0] ?? null,
      paymentMethods,
    };
  }),
  categoryCreate: adminProcedure
    .input(z.object({ name: z.string().trim().min(2).max(120) }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const slugBase = input.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      await db.insert(categories).values({
        name: input.name,
        slug: `${slugBase}-${Date.now().toString(36)}`,
      });
      return { success: true };
    }),
  categoryUpdate: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().trim().min(2).max(120),
        sortOrder: z.number().int().min(0).max(999),
      })
    )
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db
        .update(categories)
        .set({ name: input.name, sortOrder: input.sortOrder })
        .where(eq(categories.id, input.id));
      return { success: true };
    }),
  categoryToggle: adminProcedure
    .input(z.object({ id: z.number().int().positive(), isActive: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db
        .update(categories)
        .set({ isActive: input.isActive })
        .where(eq(categories.id, input.id));
      return { success: true };
    }),
  categoryDelete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [usage] = await db
        .select({ total: count() })
        .from(products)
        .where(eq(products.categoryId, input.id));
      if (usage && usage.total > 0)
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Mova ou exclua os produtos antes de remover esta categoria.",
        });
      await db.delete(categories).where(eq(categories.id, input.id));
      return { success: true };
    }),
  productCreate: adminProcedure
    .input(productFields)
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [category] = await db
        .select({ id: categories.id, isActive: categories.isActive })
        .from(categories)
        .where(eq(categories.id, input.categoryId))
        .limit(1);
      if (!category || !category.isActive)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Escolha uma categoria visível no cardápio.",
        });
      return db.transaction(async tx => {
        const [created] = await tx
          .insert(products)
          .values({ ...input, imageUrl: input.imageUrl || null })
          .$returningId();
        if (input.options.length)
          await tx.insert(productOptions).values(
            input.options.map(option => ({
              ...option,
              productId: created.id,
            }))
          );
        return { id: created.id };
      });
    }),
  productUpdate: adminProcedure
    .input(
      productFieldsBase
        .extend({ id: z.number().int().positive() })
        .superRefine(validatePromotion)
    )
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const { id, options, ...fields } = input;
      const [category] = await db
        .select({ id: categories.id, isActive: categories.isActive })
        .from(categories)
        .where(eq(categories.id, fields.categoryId))
        .limit(1);
      if (!category || !category.isActive)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Escolha uma categoria visível no cardápio.",
        });
      return db.transaction(async tx => {
        await tx
          .update(products)
          .set({ ...fields, imageUrl: fields.imageUrl || null })
          .where(eq(products.id, id));
        await tx.delete(productOptions).where(eq(productOptions.productId, id));
        if (options.length)
          await tx
            .insert(productOptions)
            .values(options.map(option => ({ ...option, productId: id })));
        return { success: true };
      });
    }),
  productAvailability: adminProcedure
    .input(
      z.object({ id: z.number().int().positive(), isAvailable: z.boolean() })
    )
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db
        .update(products)
        .set({ isAvailable: input.isAvailable })
        .where(eq(products.id, input.id));
      return { success: true };
    }),
  productDelete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.delete(products).where(eq(products.id, input.id));
      return { success: true };
    }),
  storeUpdate: adminProcedure
    .input(
      z.object({
        phone: z
          .string()
          .trim()
          .max(32)
          .refine(
            isSupportedBrazilPhone,
            "Informe um telefone brasileiro com DDD."
          ),
        address: z.string().trim().max(240),
        timeZone: z.string().trim().min(1).max(64),
        businessHours: z.string().trim().max(500),
        paymentMethods: z
          .array(z.enum(paymentMethodValues))
          .min(1)
          .max(paymentMethodValues.length),
        averageDeliveryMinutes: z.number().int().min(5).max(240),
        deliveryFeeCents: z.number().int().min(0).max(50000),
        minimumOrderCents: z.number().int().min(0).max(50000),
        closedMessage: z.string().trim().max(200),
      })
    )
    .mutation(async ({ input }) => {
      try {
        new Intl.DateTimeFormat("pt-BR", { timeZone: input.timeZone }).format(
          new Date()
        );
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Fuso horário inválido.",
        });
      }
      const db = await requireDb();
      const [existing] = await db
        .select({ id: storeSettings.id })
        .from(storeSettings)
        .limit(1);
      const { paymentMethods, ...settings } = input;
      const values = {
        ...settings,
        phone: normalizeBrazilPhone(settings.phone),
        paymentMethods: JSON.stringify(paymentMethods),
      };
      if (existing)
        await db
          .update(storeSettings)
          .set(values)
          .where(eq(storeSettings.id, existing.id));
      else await db.insert(storeSettings).values(values);
      return { success: true };
    }),
  storeSetOpen: adminProcedure
    .input(z.object({ isOpen: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [store] = await db
        .select({ id: storeSettings.id })
        .from(storeSettings)
        .limit(1);
      if (!store)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Configure os dados operacionais da loja antes de abri-la.",
        });
      await db
        .update(storeSettings)
        .set({ isOpen: input.isOpen, pauseUntil: null })
        .where(eq(storeSettings.id, store.id));
      return { success: true } as const;
    }),
  storePauseForHour: adminProcedure
    .input(z.object({ paused: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [store] = await db.select().from(storeSettings).limit(1);
      if (!store)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "A loja ainda não foi configurada.",
        });
      if (input.paused && !store.isOpen)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Abra a loja antes de iniciar uma pausa.",
        });
      const pauseUntil = input.paused
        ? new Date(Date.now() + 60 * 60 * 1000)
        : null;
      await db
        .update(storeSettings)
        .set({ pauseUntil })
        .where(eq(storeSettings.id, store.id));
      return { success: true, pauseUntil } as const;
    }),
});
