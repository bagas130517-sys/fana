ALTER TABLE "users" ADD COLUMN "plan_id" bigint;--> statement-breakpoint
-- Hand-written: nobody should land on "no plan". Take the plan the account's
-- oldest key was on, else the first plan configured on this instance.
UPDATE "users" SET "plan_id" = COALESCE(
  (SELECT "plan_id" FROM "api_keys" WHERE "api_keys"."user_id" = "users"."id" ORDER BY "id" LIMIT 1),
  (SELECT "id" FROM "plans" ORDER BY "id" LIMIT 1)
);
