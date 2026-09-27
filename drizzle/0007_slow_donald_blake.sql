CREATE TABLE `delivery_couriers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(140) NOT NULL,
	`phone` varchar(24) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `delivery_couriers_id` PRIMARY KEY(`id`),
	CONSTRAINT `delivery_couriers_phone_unique` UNIQUE(`phone`)
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `courierId` int;--> statement-breakpoint
ALTER TABLE `orders` ADD `courierAssignedAt` timestamp;--> statement-breakpoint
CREATE INDEX `delivery_couriers_active_name_idx` ON `delivery_couriers` (`isActive`,`name`);--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_courierId_delivery_couriers_id_fk` FOREIGN KEY (`courierId`) REFERENCES `delivery_couriers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `orders_courier_status_idx` ON `orders` (`courierId`,`status`);