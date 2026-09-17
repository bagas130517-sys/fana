CREATE TABLE IF NOT EXISTS "identities" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"provider" text NOT NULL,
	"provider_user_id" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"email" text,
	"name" text,
	"role" text DEFAULT 'customer' NOT NULL,
	"password_hash" text,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "user_id" bigint;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "identities" ADD CONSTRAINT "identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "identities_provider_user_idx" ON "identities" USING btree ("provider","provider_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "identities_user_idx" ON "identities" USING btree ("user_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_user_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
-- Hand-written: carry existing operators into `users` as admins. Without this
-- the merge would silently lock every operator out of their own instance.
INSERT INTO "users" ("public_id", "username", "role", "password_hash", "last_login_at", "created_at", "updated_at")
SELECT "public_id", "username", 'admin', "password_hash", "last_login_at", "created_at", "updated_at"
FROM "admins"
ON CONFLICT ("username") DO NOTHING;--> statement-breakpoint
-- Existing keys were issued before accounts existed: give them to the oldest
-- admin so nothing is left ownerless when the column turns NOT NULL.
UPDATE "api_keys" SET "user_id" = (SELECT "id" FROM "users" ORDER BY "id" LIMIT 1)
WHERE "user_id" IS NULL;