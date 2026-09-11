CREATE TABLE `learner_accounts` (
	`user_id` text PRIMARY KEY NOT NULL CHECK (length(`user_id`) BETWEEN 1 AND 255),
	`generation` integer DEFAULT 1 NOT NULL CHECK (`generation` BETWEEN 1 AND 2147483647),
	`last_reset_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
) STRICT;
--> statement-breakpoint
CREATE TABLE `progress_events` (
	`server_sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`generation` integer NOT NULL CHECK (`generation` >= 1),
	`event_id` text NOT NULL CHECK (length(`event_id`) BETWEEN 8 AND 80),
	`device_id` text NOT NULL CHECK (length(`device_id`) BETWEEN 8 AND 80),
	`client_sequence` integer NOT NULL CHECK (`client_sequence` >= 1),
	`event_type` text NOT NULL CHECK (`event_type` IN ('review-attempt', 'session-completed', 'active-unit-selected')),
	`session_id` text,
	`occurred_at` text NOT NULL,
	`time_zone` text NOT NULL,
	`date_key` text NOT NULL CHECK (length(`date_key`) = 10),
	`payload_json` text NOT NULL CHECK (json_valid(`payload_json`)),
	`event_hash` text NOT NULL CHECK (length(`event_hash`) = 64),
	`received_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `learner_accounts`(`user_id`) ON UPDATE no action ON DELETE cascade
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `progress_events_event_id_unique` ON `progress_events` (`user_id`,`generation`,`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `progress_events_device_sequence_unique` ON `progress_events` (`user_id`,`generation`,`device_id`,`client_sequence`);--> statement-breakpoint
CREATE INDEX `progress_events_materialize_idx` ON `progress_events` (`user_id`,`generation`,`server_sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `progress_events_one_completion_per_session` ON `progress_events` (`user_id`,`generation`,`session_id`) WHERE `event_type` = 'session-completed';--> statement-breakpoint
CREATE TABLE `progress_snapshots` (
	`user_id` text NOT NULL,
	`generation` integer NOT NULL CHECK (`generation` >= 1),
	`through_sequence` integer DEFAULT 0 NOT NULL CHECK (`through_sequence` >= 0),
	`progress_json` text NOT NULL CHECK (json_valid(`progress_json`)),
	`import_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `generation`),
	FOREIGN KEY (`user_id`) REFERENCES `learner_accounts`(`user_id`) ON UPDATE no action ON DELETE cascade
 ) STRICT, WITHOUT ROWID;
--> statement-breakpoint
CREATE TRIGGER `progress_events_current_generation`
BEFORE INSERT ON `progress_events`
FOR EACH ROW
WHEN NOT EXISTS (
	SELECT 1 FROM `learner_accounts`
	WHERE `user_id` = NEW.`user_id` AND `generation` = NEW.`generation`
)
BEGIN
	SELECT RAISE(ABORT, 'stale_progress_generation');
END;
--> statement-breakpoint
CREATE TRIGGER `progress_events_immutable_id`
BEFORE INSERT ON `progress_events`
FOR EACH ROW
WHEN EXISTS (
	SELECT 1 FROM `progress_events`
	WHERE `user_id` = NEW.`user_id`
		AND `generation` = NEW.`generation`
		AND `event_id` = NEW.`event_id`
		AND `event_hash` <> NEW.`event_hash`
)
BEGIN
	SELECT RAISE(ABORT, 'progress_event_id_conflict');
END;
--> statement-breakpoint
CREATE TRIGGER `progress_events_unique_device_sequence`
BEFORE INSERT ON `progress_events`
FOR EACH ROW
WHEN EXISTS (
	SELECT 1 FROM `progress_events`
	WHERE `user_id` = NEW.`user_id`
		AND `generation` = NEW.`generation`
		AND `device_id` = NEW.`device_id`
		AND `client_sequence` = NEW.`client_sequence`
		AND `event_id` <> NEW.`event_id`
)
BEGIN
	SELECT RAISE(ABORT, 'progress_device_sequence_conflict');
END;
--> statement-breakpoint
CREATE TRIGGER `progress_snapshots_current_generation_insert`
BEFORE INSERT ON `progress_snapshots`
FOR EACH ROW
WHEN NOT EXISTS (
	SELECT 1 FROM `learner_accounts`
	WHERE `user_id` = NEW.`user_id` AND `generation` = NEW.`generation`
)
BEGIN
	SELECT RAISE(ABORT, 'stale_progress_generation');
END;
--> statement-breakpoint
CREATE TRIGGER `progress_snapshots_current_generation_update`
BEFORE UPDATE ON `progress_snapshots`
FOR EACH ROW
WHEN NOT EXISTS (
	SELECT 1 FROM `learner_accounts`
	WHERE `user_id` = NEW.`user_id` AND `generation` = NEW.`generation`
)
BEGIN
	SELECT RAISE(ABORT, 'stale_progress_generation');
END;
