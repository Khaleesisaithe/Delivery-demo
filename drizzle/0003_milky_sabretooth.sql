CREATE TABLE `auth_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auth_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_sessions_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
ALTER TABLE `store_settings` MODIFY COLUMN `name` varchar(140) NOT NULL DEFAULT 'Sua loja';--> statement-breakpoint
ALTER TABLE `store_settings` MODIFY COLUMN `tagline` varchar(240) NOT NULL DEFAULT 'Feito com carinho, do nosso balcão pra sua casa.';--> statement-breakpoint
ALTER TABLE `store_settings` MODIFY COLUMN `phone` varchar(24) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `store_settings` MODIFY COLUMN `address` varchar(240) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `store_settings` MODIFY COLUMN `deliveryFeeCents` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `store_settings` MODIFY COLUMN `minimumOrderCents` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `store_settings` MODIFY COLUMN `isOpen` boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE `store_settings` ADD `brandColor` varchar(7) DEFAULT '#C84B2F' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `emailNormalized` varchar(320);--> statement-breakpoint
UPDATE `users` SET `emailNormalized` = LOWER(TRIM(`email`)) WHERE `email` IS NOT NULL AND TRIM(`email`) <> '';--> statement-breakpoint
UPDATE `users` AS current_user JOIN `users` AS earlier_user ON current_user.`emailNormalized` = earlier_user.`emailNormalized` AND current_user.`id` > earlier_user.`id` SET current_user.`emailNormalized` = CONCAT('legacy-', current_user.`id`, '@migration.invalid') WHERE current_user.`emailNormalized` IS NOT NULL;--> statement-breakpoint
UPDATE `users` SET `emailNormalized` = CONCAT('legacy-', `id`, '@migration.invalid') WHERE `emailNormalized` IS NULL OR `emailNormalized` = '';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `emailNormalized` varchar(320) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordResetRequired` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `isActive` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `failedLoginAttempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `lockedUntil` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_emailNormalized_unique` UNIQUE(`emailNormalized`);--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `auth_sessions_user_id_idx` ON `auth_sessions` (`userId`);--> statement-breakpoint
CREATE INDEX `auth_sessions_expires_at_idx` ON `auth_sessions` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `order_status_history_order_created_idx` ON `order_status_history` (`orderId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `orders_status_created_idx` ON `orders` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `orders_created_at_idx` ON `orders` (`createdAt`);
