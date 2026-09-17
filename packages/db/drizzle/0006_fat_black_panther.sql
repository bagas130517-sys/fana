ALTER TABLE "admins" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "admins" CASCADE;--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" DROP COLUMN IF EXISTS "email";