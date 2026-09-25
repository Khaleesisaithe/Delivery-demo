import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { categories, customers, orderItemOptions, orderItems, orderStatusHistory, orders, productOptions, products, storeSettings } from "../drizzle/schema";

const menu = [
  { name: "Hambúrgueres", slug: "hamburgueres", products: [
    ["Brasa Clássico", "Blend 180g, queijo prato, cebola caramelizada e molho da casa.", 3290, true],
    ["X-Bacon Defumado", "Blend artesanal, cheddar inglês, bacon crocante e maionese verde.", 3690, true],
    ["Duplo Smash", "Dois smash burgers, American cheese e molho secreto.", 3890, true],
    ["Veggie da Horta", "Burger de grão-de-bico, queijo coalho e pesto de manjericão.", 3190, false],
    ["Frango Crocante", "Sobrecoxa empanada, coleslaw e aioli cítrico.", 3390, false],
  ] },
  { name: "Combos", slug: "combos", products: [
    ["Combo Brasa", "Brasa Clássico, batata rústica e refrigerante lata.", 4690, true],
    ["Combo Duplo", "Duplo Smash, fritas com páprica e bebida 350ml.", 5290, false],
    ["Combo Veggie", "Veggie da Horta, chips de batata-doce e chá gelado.", 4490, false],
  ] },
  { name: "Porções", slug: "porcoes", products: [
    ["Batata Rústica", "Batatas com casca, alecrim e páprica defumada.", 1890, false],
    ["Onion Rings", "Anéis de cebola empanados e molho barbecue.", 2090, false],
    ["Fritas com Cheddar", "Batata dourada com cheddar cremoso e bacon.", 2490, false],
  ] },
  { name: "Bebidas", slug: "bebidas", products: [
    ["Guaraná Antarctica", "Lata 350ml, geladinha.", 700, false],
    ["Coca-Cola Zero", "Lata 350ml.", 700, false],
    ["Limonada da Casa", "Limão tahiti, siciliano e toque de hortelã · 400ml.", 1100, false],
    ["Chá Mate Pêssego", "Mate artesanal com pêssego · 400ml.", 1200, false],
  ] },
  { name: "Sobremesas", slug: "sobremesas", products: [
    ["Brownie Quentinho", "Brownie de chocolate 60% com calda da casa.", 1490, false],
    ["Cheesecake de Frutas", "Cream cheese leve com frutas vermelhas.", 1690, false],
    ["Milk-shake de Paçoca", "Sorvete de baunilha batido com paçoca · 400ml.", 1890, false],
  ] },
] as const;

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL indisponível; configure o banco e tente novamente.");
  const existing = await db.select({ id: categories.id }).from(categories).limit(1);
  if (existing.length) {
    console.log("Dados de demonstração já existem; seed não alterou os dados atuais.");
    return;
  }

  await db.insert(storeSettings).values({
    name: "Brasa & Ponto", tagline: "Burger de verdade, do nosso fogo pra sua casa.", phone: "5511999999999",
    address: "Rua dos Pinheiros, 245 · São Paulo, SP", businessHours: "Ter–Dom · 18h às 23h",
    averageDeliveryMinutes: 35, deliveryFeeCents: 700, minimumOrderCents: 2000, isOpen: true,
    closedMessage: "Voltamos às 18h.", paymentMethods: JSON.stringify(["pix", "cash", "card_delivery", "card_pickup"]),
  });
  for (let index = 0; index < menu.length; index++) {
    const group = menu[index];
    const [created] = await db.insert(categories).values({ name: group.name, slug: group.slug, sortOrder: index }).$returningId();
    for (let productIndex = 0; productIndex < group.products.length; productIndex++) {
      const product = group.products[productIndex];
      const [item] = await db.insert(products).values({
        categoryId: created.id, name: product[0], description: product[1], priceCents: product[2],
        imageUrl: "/assets/food/brasa-burger.jpg", isAvailable: true, isFeatured: product[3], sortOrder: productIndex,
      }).$returningId();
      if (group.slug === "hamburgueres") {
        await db.insert(productOptions).values([
          { productId: item.id, name: "Queijo extra", priceCents: 300, isAvailable: true },
          { productId: item.id, name: "Bacon extra", priceCents: 500, isAvailable: true },
          { productId: item.id, name: "Ovo caipira", priceCents: 250, isAvailable: true },
        ]);
      }
    }
  }

  const sampleOrders = [
    { status: "received" as const, name: "Maria Silva", phone: "5511999000101", productId: 2, totalCents: 4390, paymentMethod: "pix" as const },
    { status: "preparing" as const, name: "Rafael Costa", phone: "5511999000102", productId: 1, totalCents: 3990, paymentMethod: "card_delivery" as const },
    { status: "ready" as const, name: "Lúcia Martins", phone: "5511999000103", productId: 6, totalCents: 5390, paymentMethod: "cash" as const },
    { status: "out_for_delivery" as const, name: "João Pedro", phone: "5511999000104", productId: 3, totalCents: 4590, paymentMethod: "pix" as const },
  ];
  for (const sample of sampleOrders) {
    await db.insert(customers).values({ name: sample.name, phone: sample.phone });
    const [customer] = await db.select().from(customers).where(eq(customers.phone, sample.phone)).limit(1);
    const product = (await db.select().from(products).where(eq(products.id, sample.productId)).limit(1))[0];
    const publicId = `${Math.random().toString(16).slice(2).padEnd(24, "0").slice(0, 24)}`;
    const [createdOrder] = await db.insert(orders).values({
      publicId, orderNumber: null, customerId: customer.id, deliveryType: "delivery", status: sample.status,
      paymentMethod: sample.paymentMethod, subtotalCents: sample.totalCents - 700, deliveryFeeCents: 700,
      discountCents: 0, totalCents: sample.totalCents, street: "Rua dos Pinheiros", streetNumber: "245",
      neighborhood: "Pinheiros", city: "São Paulo", postalCode: "05422-010",
    }).$returningId();
    const orderNumber = `BP-${String(createdOrder.id).padStart(5, "0")}`;
    await db.update(orders).set({ orderNumber }).where(eq(orders.id, createdOrder.id));
    const [createdItem] = await db.insert(orderItems).values({
      orderId: createdOrder.id, productId: product.id, productName: product.name, unitPriceCents: product.priceCents,
      quantity: 1, note: null,
    }).$returningId();
    await db.insert(orderStatusHistory).values({ orderId: createdOrder.id, status: "received", note: "Pedido de demonstração", changedBy: sample.name });
    if (sample.status !== "received") await db.insert(orderStatusHistory).values({ orderId: createdOrder.id, status: sample.status, note: "Status atual de demonstração", changedBy: "Equipe da loja" });
    if (sample.productId === 2) await db.insert(orderItemOptions).values({ orderItemId: createdItem.id, optionName: "Bacon extra", priceCents: 500 });
  }
  console.log(`Seed concluído: ${menu.reduce((sum, group) => sum + group.products.length, 0)} produtos, ${sampleOrders.length} pedidos e 5 categorias.`);
}

main().catch(error => { console.error(error); process.exit(1); });
