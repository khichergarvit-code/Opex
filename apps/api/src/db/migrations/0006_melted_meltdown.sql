CREATE TYPE "public"."memory_scope" AS ENUM('user', 'project', 'workspace');--> statement-breakpoint
CREATE TYPE "public"."memory_source_kind" AS ENUM('conversation', 'document', 'web');--> statement-breakpoint
CREATE TYPE "public"."memory_type" AS ENUM('episodic', 'semantic');--> statement-breakpoint
CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"user_id" uuid NOT NULL,
	"type" "memory_type" NOT NULL,
	"scope" "memory_scope" NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(1024),
	"confidence" real NOT NULL,
	"classification" smallint DEFAULT 0 NOT NULL,
	"source_kind" "memory_source_kind" DEFAULT 'conversation' NOT NULL,
	"source_conversation_id" uuid,
	"source_trace_id" uuid,
	"supersedes_id" uuid,
	"access_count" integer DEFAULT 0 NOT NULL,
	"last_accessed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "memory_extracted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_source_conversation_id_conversations_id_fk" FOREIGN KEY ("source_conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_source_trace_id_traces_id_fk" FOREIGN KEY ("source_trace_id") REFERENCES "public"."traces"("id") ON DELETE set null ON UPDATE no action;