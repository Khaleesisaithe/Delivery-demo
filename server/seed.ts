import "dotenv/config";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { closeDb, getDb } from "./db.js";
import {
  categories,
  customers,
  orderItemOptions,
  orderItems,
  orderStatusHistory,
  orders,
  productOptions,
  products,
  storeSettings,
} from "../drizzle/schema.js";

const menu = [
  {
    name: "Hambúrgueres",
    slug: "hamburgueres",
    products: [
      [
        "Brasa Clássico",
        "Blend 180g, queijo prato, cebola caramelizada e molho da casa.",
        3290,
        true,
      ],
      [
        "X-Bacon Defumado",
        "Blend artesanal, cheddar inglês, bacon crocante e maionese verde.",
        3690,
        true,
      ],
      [
        "Duplo Smash",
        "Dois smash burgers, American cheese e molho secreto.",
        3890,
        true,
      ],
      [
        "Veggie da Horta",
        "Burger de grão-de-bico, queijo coalho e pesto de manjericão.",
        3190,
        false,
      ],
      [
        "Frango Crocante",
        "Sobrecoxa empanada, coleslaw e aioli cítrico.",
        3390,
        false,
      ],
    ],
  },
  {
    name: "Combos",
    slug: "combos",
    products: [
      [
        "Combo Brasa",
        "Brasa Clássico, batata rústica e refrigerante lata.",
        4690,
        true,
      ],
      [
        "Combo Duplo",
        "Duplo Smash, fritas com páprica e bebida 350ml.",
        5290,
        false,
      ],
      [
        "Combo Veggie",
        "Veggie da Horta, chips de batata-doce e chá gelado.",
        4490,
        false,
      ],
    ],
  },
  {
    name: "Porções",
    slug: "porcoes",
    products: [
      [
        "Batata Rústica",
        "Batatas com casca, alecrim e páprica defumada.",
        1890,
        false,
      ],
      [
        "Onion Rings",
        "Anéis de cebola empanados e molho barbecue.",
        2090,
        false,
      ],
      [
        "Fritas com Cheddar",
        "Batata dourada com cheddar cremoso e bacon.",
        2490,
        false,
      ],
    ],
  },
  {
    name: "Bebidas",
    slug: "bebidas",
    products: [
      ["Guaraná Antarctica", "Lata 350ml, geladinha.", 700, false],
      ["Coca-Cola Zero", "Lata 350ml.", 700, false],
      [
        "Limonada da Casa",
        "Limão tahiti, siciliano e toque de hortelã · 400ml.",
        1100,
        false,
      ],
      ["Chá Mate Pêssego", "Mate artesanal com pêssego · 400ml.", 1200, false],
    ],
  },
  {
    name: "Sobremesas",
    slug: "sobremesas",
    products: [
      [
        "Brownie Quentinho",
        "Brownie de chocolate 60% com calda da casa.",
        1490,
        false,
      ],
      [
        "Cheesecake de Frutas",
        "Cream cheese leve com frutas vermelhas.",
        1690,
        false,
      ],
      [
        "Milk-shake de Paçoca",
        "Sorvete de baunilha batido com paçoca · 400ml.",
        1890,
        false,
      ],
    ],
  },
  {
    name: "Açaí",
    slug: "acai",
    products: [
      ["Açaí da Casa", "Açaí com frutas e acompanhamentos.", 2490, true],
    ],
  },
  {
    name: "Sucos naturais",
    slug: "sucos-naturais",
    products: [["Suco Natural", "Suco preparado na hora.", 1200, false]],
  },
  {
    name: "Marmitex",
    slug: "marmitex",
    products: [
      ["Marmitex do Dia", "Consulte as opções e acompanhamentos.", 2590, false],
    ],
  },
] as const;

const demoPromotionPrices: Record<string, number> = {
  "Combo Brasa": 4290,
  "Açaí da Casa": 2190,
};

async function main() {
  const db = await getDb();
  if (!db)
    throw new Error(
      "DATABASE_URL indisponível; configure o banco e tente novamente."
    );
  const includeDemoMenu =
    process.argv.includes("--demo") || process.env.SEED_DEMO_MENU === "true";
  const includeSampleOrders =
    process.argv.includes("--sample-orders") ||
    process.env.SEED_SAMPLE_ORDERS === "true";
  const existing = await db
    .select({ id: categories.id })
    .from(categories)
    .limit(1);
  const existingProducts = await db
    .select({ id: products.id })
    .from(products)
    .limit(1);
  const canAddMenu = !existingProducts.length;
  if (
    (!canAddMenu && !includeSampleOrders) ||
    (existing.length && !includeDemoMenu && !includeSampleOrders)
  ) {
    console.log(
      "A loja já possui dados; seed não alterou produtos, configurações ou pedidos."
    );
    return;
  }
  const [existingSettings] = await db
    .select({ id: storeSettings.id })
    .from(storeSettings)
    .limit(1);
  if (!existingSettings)
    await db.insert(storeSettings).values({
      name: "Sua loja",
      tagline: "Feito com carinho, do nosso balcão pra sua casa.",
      phone: "",
      address: "",
      brandColor: "#C84B2F",
      businessHours: "",
      logoUrl: null,
      bannerUrl: null,
      averageDeliveryMinutes: 35,
      deliveryFeeCents: 0,
      minimumOrderCents: 0,
      isOpen: false,
      closedMessage: "Voltamos às 18h.",
      paymentMethods: JSON.stringify([
        "pix",
        "cash",
        "card_delivery",
        "card_pickup",
      ]),
    });
  await db.transaction(async tx => {
    for (let index = 0; index < menu.length; index++) {
      const group = menu[index];
      const [existingCategory] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.slug, group.slug))
        .limit(1);
      const [created] = existingCategory
        ? [existingCategory]
        : await tx
            .insert(categories)
            .values({ name: group.name, slug: group.slug, sortOrder: index })
            .$returningId();
      if (!includeDemoMenu || !canAddMenu) continue;
      for (
        let productIndex = 0;
        productIndex < group.products.length;
        productIndex++
      ) {
        const product = group.products[productIndex];
        const promotionPriceCents = demoPromotionPrices[product[0]] ?? null;
        const [item] = await tx
          .insert(products)
          .values({
            categoryId: created.id,
            name: product[0],
            description: product[1],
            priceCents: product[2],
            imageUrl: "/assets/food/burger.jpg",
            isAvailable: true,
            isFeatured: product[3],
            sortOrder: productIndex,
            isPromotion: promotionPriceCents !== null,
            promotionPriceCents,
          })
          .$returningId();
        if (group.slug === "hamburgueres") {
          await tx.insert(productOptions).values([
            {
              productId: item.id,
              name: "Queijo extra",
              priceCents: 300,
              isAvailable: true,
            },
            {
              productId: item.id,
              name: "Bacon extra",
              priceCents: 500,
              isAvailable: true,
            },
            {
              productId: item.id,
              name: "Ovo caipira",
              priceCents: 250,
              isAvailable: true,
            },
          ]);
        }
      }
    }
    if (
      includeDemoMenu &&
      canAddMenu &&
      process.env.SEED_DEMO_STORE_OPEN === "true"
    ) {
      const [demoStore] = await tx
        .select({ id: storeSettings.id })
        .from(storeSettings)
        .limit(1);
      if (demoStore)
        await tx
          .update(storeSettings)
          .set({ isOpen: true })
          .where(eq(storeSettings.id, demoStore.id));
    }
  });

  const sampleOrders =
    includeDemoMenu && includeSampleOrders
      ? [
          {
            status: "received" as const,
            name: "Maria Silva",
            phone: "5511999000101",
            productId: 2,
            totalCents: 4390,
            paymentMethod: "pix" as const,
          },
          {
            status: "preparing" as const,
            name: "Rafael Costa",
            phone: "5511999000102",
            productId: 1,
            totalCents: 3990,
            paymentMethod: "card_delivery" as const,
          },
          {
            status: "ready" as const,
            name: "Lúcia Martins",
            phone: "5511999000103",
            productId: 6,
            totalCents: 5390,
            paymentMethod: "cash" as const,
          },
          {
            status: "out_for_delivery" as const,
            name: "João Pedro",
            phone: "5511999000104",
            productId: 3,
            totalCents: 4590,
            paymentMethod: "pix" as const,
          },
        ]
      : [];
  for (let sampleIndex = 0; sampleIndex < sampleOrders.length; sampleIndex++) {
    const sample = sampleOrders[sampleIndex];
    const demoOrderNumber = `DEMO-${String(sampleIndex + 1).padStart(2, "0")}`;
    const [alreadySeeded] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.orderNumber, demoOrderNumber))
      .limit(1);
    if (alreadySeeded) continue;
    await db
      .insert(customers)
      .values({ name: sample.name, phone: sample.phone });
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.phone, sample.phone))
      .limit(1);
    const product = (
      await db
        .select()
        .from(products)
        .where(eq(products.id, sample.productId))
        .limit(1)
    )[0];
    const publicId = randomBytes(12).toString("hex");
    const [createdOrder] = await db
      .insert(orders)
      .values({
        publicId,
        orderNumber: demoOrderNumber,
        customerId: customer.id,
        deliveryType: "delivery",
        status: sample.status,
        paymentMethod: sample.paymentMethod,
        subtotalCents: sample.totalCents - 700,
        deliveryFeeCents: 700,
        discountCents: 0,
        totalCents: sample.totalCents,
        street: "Rua dos Pinheiros",
        streetNumber: "245",
        neighborhood: "Pinheiros",
        city: "São Paulo",
        postalCode: "05422-010",
      })
      .$returningId();
    const [createdItem] = await db
      .insert(orderItems)
      .values({
        orderId: createdOrder.id,
        productId: product.id,
        productName: product.name,
        unitPriceCents: product.priceCents,
        quantity: 1,
        note: null,
      })
      .$returningId();
    await db
      .insert(orderStatusHistory)
      .values({
        orderId: createdOrder.id,
        status: "received",
        note: "Pedido de demonstração",
        changedBy: sample.name,
      });
    if (sample.status !== "received")
      await db
        .insert(orderStatusHistory)
        .values({
          orderId: createdOrder.id,
          status: sample.status,
          note: "Status atual de demonstração",
          changedBy: "Equipe da loja",
        });
    if (sample.productId === 2)
      await db
        .insert(orderItemOptions)
        .values({
          orderItemId: createdItem.id,
          optionName: "Bacon extra",
          priceCents: 500,
        });
  }
  console.log(
    `Seed concluído: ${includeDemoMenu ? menu.reduce((sum, group) => sum + group.products.length, 0) : 0} produtos de demonstração, ${sampleOrders.length} pedidos fictícios e ${menu.length} categorias.`
  );
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDb);
