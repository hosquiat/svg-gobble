-- CreateTable
CREATE TABLE "GoogleDriveAuth" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiry" DATETIME NOT NULL,
    "email" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GoogleDriveConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Backup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "driveFileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "defaultCollectionId" TEXT,
    "cardSize" INTEGER NOT NULL DEFAULT 192,
    "showSizes" BOOLEAN NOT NULL DEFAULT true,
    "showNames" BOOLEAN NOT NULL DEFAULT true,
    "theme" TEXT NOT NULL DEFAULT 'system',
    "optimizationPreset" TEXT NOT NULL DEFAULT 'default',
    "archiveRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "backupEnabled" BOOLEAN NOT NULL DEFAULT false,
    "backupSchedule" TEXT NOT NULL DEFAULT '0 2 * * *',
    "backupRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "googleDriveEnabled" BOOLEAN NOT NULL DEFAULT false,
    "localBackupEnabled" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_Settings" ("cardSize", "defaultCollectionId", "id", "optimizationPreset", "showNames", "showSizes", "theme") SELECT "cardSize", "defaultCollectionId", "id", "optimizationPreset", "showNames", "showSizes", "theme" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
