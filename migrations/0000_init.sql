CREATE TABLE `balances` (
	`account` text PRIMARY KEY NOT NULL,
	`balance_cents` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text,
	`owner_id` text NOT NULL,
	`key` text NOT NULL,
	`kind` text NOT NULL,
	`content_type` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_key_idx` ON `documents` (`key`);--> statement-breakpoint
CREATE TABLE `gifts` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`patron_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`kind` text NOT NULL,
	`anonymous` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'settled' NOT NULL,
	`payment_ref` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patron_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `gifts_patron_idx` ON `gifts` (`patron_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `gifts_request_idx` ON `gifts` (`request_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`gift_id` text NOT NULL,
	`account` text NOT NULL,
	`delta_cents` integer NOT NULL,
	`memo` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`gift_id`) REFERENCES `gifts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ledger_account_idx` ON `ledger_entries` (`account`);--> statement-breakpoint
CREATE INDEX `ledger_gift_idx` ON `ledger_entries` (`gift_id`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`reporter_id` text,
	`reason` text NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `request_updates` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `updates_request_idx` ON `request_updates` (`request_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `requests` (
	`id` text PRIMARY KEY NOT NULL,
	`seeker_id` text NOT NULL,
	`first_name` text NOT NULL,
	`age` integer,
	`city` text NOT NULL,
	`country` text NOT NULL,
	`country_code` text NOT NULL,
	`lat` real,
	`lng` real,
	`category` text NOT NULL,
	`headline` text NOT NULL,
	`story` text NOT NULL,
	`breakdown` text NOT NULL,
	`goal_cents` integer NOT NULL,
	`funded_cents` integer DEFAULT 0 NOT NULL,
	`gift_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`verification` text DEFAULT 'unverified' NOT NULL,
	`verification_at` integer,
	`avatar_seed` text NOT NULL,
	`photo_key` text,
	`blur_photo` integer DEFAULT false NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`funded_at` integer,
	FOREIGN KEY (`seeker_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `requests_status_idx` ON `requests` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `requests_seeker_idx` ON `requests` (`seeker_id`);--> statement-breakpoint
CREATE TABLE `swipes` (
	`patron_id` text NOT NULL,
	`request_id` text NOT NULL,
	`action` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	PRIMARY KEY(`patron_id`, `request_id`),
	FOREIGN KEY (`patron_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`display_name` text NOT NULL,
	`persona` text,
	`avatar_seed` text NOT NULL,
	`anonymous_by_default` integer DEFAULT false NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
