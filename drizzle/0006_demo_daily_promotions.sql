UPDATE `products`
SET `isPromotion` = TRUE, `promotionPriceCents` = 4290
WHERE `name` = 'Combo Brasa'
  AND `priceCents` = 4690
  AND `imageUrl` = '/assets/food/combo-1.jpg'
  AND `isAvailable` = TRUE
  AND `isPromotion` = FALSE
  AND `promotionPriceCents` IS NULL;
--> statement-breakpoint
UPDATE `products`
SET `isPromotion` = TRUE, `promotionPriceCents` = 2190
WHERE `name` = 'Açaí da Casa'
  AND `priceCents` = 2490
  AND `imageUrl` = '/assets/food/acai-bowl.jpg'
  AND `isAvailable` = TRUE
  AND `isPromotion` = FALSE
  AND `promotionPriceCents` IS NULL;
