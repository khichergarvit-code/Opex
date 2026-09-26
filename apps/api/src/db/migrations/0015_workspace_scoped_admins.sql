ALTER TABLE "users" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Backfill: a person belongs to the workspace of their first project; super admins stay platform-wide (null).
UPDATE "users" u SET "workspace_id" = (
  SELECT p."workspace_id" FROM "project_members" pm JOIN "projects" p ON p."id" = pm."project_id"
  WHERE pm."user_id" = u."id" ORDER BY p."created_at" LIMIT 1
) WHERE u."role" <> 'super_admin';--> statement-breakpoint
UPDATE "groups" g SET "workspace_id" = COALESCE(
  (SELECT u."workspace_id" FROM "user_groups" ug JOIN "users" u ON u."id" = ug."user_id" WHERE ug."group_id" = g."id" AND u."workspace_id" IS NOT NULL LIMIT 1),
  (SELECT w."id" FROM "workspaces" w ORDER BY w."created_at" LIMIT 1)
);--> statement-breakpoint
CREATE INDEX "users_workspace_idx" ON "users" ("workspace_id");--> statement-breakpoint
CREATE INDEX "groups_workspace_idx" ON "groups" ("workspace_id");
