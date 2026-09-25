import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { categories, products } from "../drizzle/schema";
import { getDb } from "./db";

const expandedMenu = [
  {
    name: "Açaí", slug: "acai", imageUrl: "/assets/food/brasa-acai.jpg",
    products: [
      ["Açaí Tradicional 300g", "Açaí cremoso com banana e granola crocante.", 2490, true],
      ["Açaí Completo 500g", "Açaí com banana, morango, granola e leite condensado.", 3490, true],
      ["Açaí com Paçoca", "Açaí batido com banana, paçoca e granola.", 3190, false],
    ] as const,
  },
  {
    name: "Sucos naturais", slug: "sucos-naturais", imageUrl: "/assets/food/brasa-suco.jpg",
    products: [
      ["Suco de Laranja Natural", "Laranjas frescas espremidas na hora · 400ml.", 1190, true],
      ["Suco de Abacaxi com Hortelã", "Abacaxi natural batido com hortelã · 400ml.", 1090, false],
      ["Suco de Maracujá", "Maracujá natural, leve e refrescante · 400ml.", 1090, false],
    ] as const,
  },
  {
    name: "Marmitex", slug: "marmitex", imageUrl: "/assets/food/brasa-marmitex.jpg",
    products: [
      ["Marmitex Frango Grelhado", "Arroz, feijão, frango grelhado e acompanhamento do dia.", 2890, true],
      ["Marmitex Carne de Panela", "Carne cozida lentamente, arroz, feijão e legumes.", 3290, true],
      ["Marmitex Feijoada Completa", "Feijoada da casa, arroz, couve, farofa e laranja.", 3490, false],
    ] as const,
  },
] as const;

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL indisponível; configure o banco e tente novamente.");
  let added = 0;
  for (let categoryIndex = 0; categoryIndex < expandedMenu.length; categoryIndex++) {
    const group = expandedMenu[categoryIndex]!;
    const [existingCategory] = await db.select().from(categories).where(eq(categories.slug, group.slug)).limit(1);
    const category = existingCategory ?? (await db.insert(categories).values({ name: group.name, slug: group.slug, sortOrder: 10 + categoryIndex }).$returningId())[0];
    if (!category) throw new Error(`Não foi possível criar categoria: ${group.name}`);
    if (existingCategory && !existingCategory.isActive) await db.update(categories).set({ isActive: true }).where(eq(categories.id, existingCategory.id));
    for (let productIndex = 0; productIndex < group.products.length; productIndex++) {
      const [name, description, priceCents, isFeatured] = group.products[productIndex]!;
      const [existingProduct] = await db.select({ id: products.id }).from(products).where(and(eq(products.categoryId, category.id), eq(products.name, name))).limit(1);
      if (existingProduct) continue;
      await db.insert(products).values({ categoryId: category.id, name, description, priceCents, imageUrl: group.imageUrl, isAvailable: true, isFeatured, sortOrder: productIndex });
      added++;
    }
  }
  console.log(`Cardápio ampliado: ${added} novos itens (açaí, sucos naturais e marmitex).`);
}

main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
