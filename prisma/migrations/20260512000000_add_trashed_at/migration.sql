-- AlterTable: add trashedAt column (nullable, no default)
ALTER TABLE "Note" ADD COLUMN "trashedAt" DATETIME;
