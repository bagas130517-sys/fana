CREATE TABLE IF NOT EXISTS "attachments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"message_id" bigint NOT NULL,
	"filename" text NOT NULL,
	"content_type" text DEFAULT 'application/octet-stream' NOT NULL,
	"size" integer NOT NULL,
	"content" "bytea",
	"storage_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "domains" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domains_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"mailbox" text NOT NULL,
	"from_address" text NOT NULL,
	"from_name" text,
	"subject" text DEFAULT '' NOT NULL,
	"text" text,
	"html" text,
	"raw" "bytea",
	"spf" text,
	"dkim" text,
	"dmarc" text,
	"verdict" text DEFAULT 'unverified' NOT NULL,
	"seen" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reservations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservations_address_unique" UNIQUE("address")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachments_message_idx" ON "attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_mailbox_idx" ON "messages" USING btree ("mailbox","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_expires_idx" ON "messages" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reservations_expires_idx" ON "reservations" USING btree ("expires_at");