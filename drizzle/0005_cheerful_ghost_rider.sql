CREATE TABLE `order_internal_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`authorName` varchar(160) NOT NULL,
	`note` varchar(500) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `order_internal_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `products` ADD `isPromotion` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `promotionPriceCents` int;--> statement-breakpoint
ALTER TABLE `store_settings` ADD `pauseUntil` timestamp;--> statement-breakpoint
ALTER TABLE `order_internal_notes` ADD CONSTRAINT `order_internal_notes_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `order_internal_notes_order_created_idx` ON `order_internal_notes` (`orderId`,`createdAt`);
--> statement-breakpoint
INSERT INTO `order_internal_notes` (`orderId`, `authorName`, `note`, `createdAt`)
SELECT `id`, 'Equipe (registro anterior)', TRIM(`internalNote`), COALESCE(`updatedAt`, `createdAt`)
FROM `orders`
WHERE `internalNote` IS NOT NULL AND TRIM(`internalNote`) <> '';
