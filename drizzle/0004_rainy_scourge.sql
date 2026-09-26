ALTER TABLE `orders` ADD `deliveredAt` timestamp;--> statement-breakpoint
ALTER TABLE `store_settings` ADD `timeZone` varchar(64) DEFAULT 'America/Sao_Paulo' NOT NULL;