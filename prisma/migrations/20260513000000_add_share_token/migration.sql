-- Add shareToken column to Note for public share links
ALTER TABLE "Note" ADD COLUMN "shareToken" TEXT;

-- Unique index so token lookups are fast and collisions are prevented at DB level
CREATE UNIQUE INDEX "Note_shareToken_key" ON "Note"("shareToken");
