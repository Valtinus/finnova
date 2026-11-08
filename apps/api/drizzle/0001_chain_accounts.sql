CREATE TABLE `chain_accounts` (
	`customer_id` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`address_key` text NOT NULL,
	`linked_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chain_accounts_address_key_unique` ON `chain_accounts` (`address_key`);