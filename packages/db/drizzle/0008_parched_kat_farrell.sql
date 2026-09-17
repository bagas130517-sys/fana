ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_plan_id_plans_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "api_keys_plan_idx";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "plan_id" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "api_keys" DROP COLUMN IF EXISTS "plan_id";