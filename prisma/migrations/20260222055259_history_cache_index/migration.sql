-- AlterTable
ALTER TABLE "HistoryEntry" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'generic',
ADD COLUMN     "requestHash" TEXT;

-- CreateIndex
CREATE INDEX "HistoryEntry_kind_requestHash_idx" ON "HistoryEntry"("kind", "requestHash");
