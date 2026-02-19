/*
  Warnings:

  - You are about to drop the column `theme` on the `Settings` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "defaultCollectionId" TEXT,
    "cardSize" INTEGER NOT NULL DEFAULT 192,
    "showSizes" BOOLEAN NOT NULL DEFAULT true,
    "showNames" BOOLEAN NOT NULL DEFAULT true,
    "optimizationPreset" TEXT NOT NULL DEFAULT 'default',
    "archiveRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "backupEnabled" BOOLEAN NOT NULL DEFAULT false,
    "backupSchedule" TEXT NOT NULL DEFAULT '0 2 * * *',
    "backupRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "googleDriveEnabled" BOOLEAN NOT NULL DEFAULT false,
    "localBackupEnabled" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_Settings" ("archiveRetentionDays", "backupEnabled", "backupRetentionDays", "backupSchedule", "cardSize", "defaultCollectionId", "googleDriveEnabled", "id", "localBackupEnabled", "optimizationPreset", "showNames", "showSizes") SELECT "archiveRetentionDays", "backupEnabled", "backupRetentionDays", "backupSchedule", "cardSize", "defaultCollectionId", "googleDriveEnabled", "id", "localBackupEnabled", "optimizationPreset", "showNames", "showSizes" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
