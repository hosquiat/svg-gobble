-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Svg" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "svg" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME,
    CONSTRAINT "Svg_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Svg" ("collectionId", "contentHash", "createdAt", "id", "name", "svg", "type", "updatedAt") SELECT "collectionId", "contentHash", "createdAt", "id", "name", "svg", "type", "updatedAt" FROM "Svg";
DROP TABLE "Svg";
ALTER TABLE "new_Svg" RENAME TO "Svg";
CREATE INDEX "Svg_contentHash_idx" ON "Svg"("contentHash");
CREATE INDEX "Svg_collectionId_idx" ON "Svg"("collectionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
