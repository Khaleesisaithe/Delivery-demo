import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "../server/db.js";
import { products, storeSettings } from "../drizzle/schema.js";

const isVerifiedDemoProduction =
  process.env.VERCEL_ENV === "production" &&
  process.env.VERCEL_PROJECT_ID === "prj_A0CgPvjbn5rxJExBYbCYhoqzHEyQ" &&
  (process.env.VERCEL_GIT_REPO_OWNER || "").toLowerCase() ===
    "khaleesisaithe" &&
  (process.env.VERCEL_GIT_REPO_SLUG || "").toLowerCase() === "delivery-demo" &&
  process.env.VERCEL_GIT_COMMIT_REF === "main";

if (!isVerifiedDemoProduction) {
  throw new Error(
    "This demo-only storefront refresh may run only in its verified Vercel production project."
  );
}

const imageByProduct: Record<string, string> = {
  "Combo Brasa": "/assets/food/combo-1.jpg",
  "Combo Duplo": "/assets/food/combo-2.jpg",
  "Combo Veggie": "/assets/food/combo-3.jpg",
  "Açaí da Casa": "/assets/food/acai-bowl.jpg",
  "Suco Natural": "/assets/food/natural-juice.jpg",
  "Marmitex do Dia": "/assets/food/marmitex.jpg",
};

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL indisponível.");

  const [currentStore] = await db
    .select({ id: storeSettings.id, name: storeSettings.name })
    .from(storeSettings)
    .limit(1);
  if (!currentStore || currentStore.name !== "Sua loja") {
    console.log(
      "Demo storefront refresh skipped: a non-placeholder store name is already configured."
    );
    return;
  }

  const photoUpdates = await db.transaction(async tx => {
    await tx
      .update(storeSettings)
      .set({ name: "Brasa & Ponto" })
      .where(eq(storeSettings.id, currentStore.id));

    let count = 0;
    for (const [productName, imageUrl] of Object.entries(imageByProduct)) {
      const [result] = await tx
        .update(products)
        .set({ imageUrl })
        .where(
          and(
            eq(products.name, productName),
            eq(products.imageUrl, "/assets/food/burger.jpg")
          )
        );
      count += Number(result?.affectedRows ?? 0);
    }
    return count;
  });

  console.log(
    `Demo storefront refresh complete: placeholder brand set to Brasa & Ponto; ${photoUpdates} default product photo(s) replaced. Existing custom branding and every previously changed photo were preserved.`
  );
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDb);
