-- Add status column to Note (active | on_hold | completed | dropped)
-- Existing notes default to 'active'.
ALTER TABLE "Note" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
