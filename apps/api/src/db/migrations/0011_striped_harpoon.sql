ALTER TABLE "conversations" ADD COLUMN "document_mode" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "source" text;