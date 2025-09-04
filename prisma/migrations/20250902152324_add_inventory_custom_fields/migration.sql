-- AlterTable
ALTER TABLE "public"."Inventory" ADD COLUMN     "customBool1Name" TEXT,
ADD COLUMN     "customBool1State" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "customBool2Name" TEXT,
ADD COLUMN     "customBool2State" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "customBool3Name" TEXT,
ADD COLUMN     "customBool3State" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "customInt1Name" TEXT,
ADD COLUMN     "customInt1State" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "customInt2Name" TEXT,
ADD COLUMN     "customInt2State" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "customInt3Name" TEXT,
ADD COLUMN     "customInt3State" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "customString1Name" TEXT,
ADD COLUMN     "customString1State" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "customString2Name" TEXT,
ADD COLUMN     "customString2State" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "customString3Name" TEXT,
ADD COLUMN     "customString3State" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."Item" (
    "id" VARCHAR(21) NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "values" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Comment" (
    "id" VARCHAR(21) NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."Item" ADD CONSTRAINT "Item_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "public"."Inventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Comment" ADD CONSTRAINT "Comment_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "public"."Inventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
