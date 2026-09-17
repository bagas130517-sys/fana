CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"webhook_id" bigint NOT NULL,
	"message_id" bigint NOT NULL,
	"event" text DEFAULT 'message.received' NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_status" integer,
	"last_error" text,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_deliveries_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhooks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" bigint NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"last_delivery_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhooks_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_deliveries_once_idx" ON "webhook_deliveries" USING btree ("webhook_id","message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_deliveries_due_idx" ON "webhook_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhooks_user_idx" ON "webhooks" USING btree ("user_id");