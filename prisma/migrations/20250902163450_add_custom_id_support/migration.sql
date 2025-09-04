/*
  Warnings:

  - A unique constraint covering the columns `[inventoryId,customId]` on the table `Item` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."Inventory" ADD COLUMN     "customIdFormat" JSONB,
ADD COLUMN     "nextSequence" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "public"."Item" ADD COLUMN     "customId" TEXT,
ADD COLUMN     "sequence" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Item_inventoryId_customId_key" ON "public"."Item"("inventoryId", "customId");
