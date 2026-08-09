ALTER TABLE "invites" ADD COLUMN "invitee_email" text;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "email_delivered_at" timestamp with time zone;