CREATE TABLE IF NOT EXISTS "api_key_usage" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"key_id" bigint NOT NULL,
	"period" text NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"email" text,
	"key_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"plan_id" bigint NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plans" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"monthly_requests" integer DEFAULT 1000 NOT NULL,
	"requests_per_minute" integer DEFAULT 30 NOT NULL,
	"retention_minutes" integer DEFAULT 60 NOT NULL,
	"concurrent_inboxes" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_key_usage" ADD CONSTRAINT "api_key_usage_key_id_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_key_usage_key_period_idx" ON "api_key_usage" USING btree ("key_id","period");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_plan_idx" ON "api_keys" USING btree ("plan_id");