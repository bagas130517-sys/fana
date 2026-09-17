ALTER TABLE "messages" ADD COLUMN "owner_user_id" bigint;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "owner_user_id" bigint;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_owner_idx" ON "messages" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reservations_owner_idx" ON "reservations" USING btree ("owner_user_id");--> statement-breakpoint
-- Retention used to be looked up through key_id; it now reads owner_user_id, so
-- inboxes minted before this migration keep the plan they were promised.
UPDATE "reservations" AS r SET "owner_user_id" = k."user_id" FROM "api_keys" AS k WHERE r."key_id" = k."id" AND r."owner_user_id" IS NULL;