-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'VHF_CONTACT_FOLLOW_UP';
ALTER TYPE "NotificationType" ADD VALUE 'VHF_CONTACT_MISSED';

-- AlterTable: one VHF contact reminder per follow-up day; existing rows keep -1
ALTER TABLE "Notification" ADD COLUMN "followUpDay" INTEGER NOT NULL DEFAULT -1;

-- Widen the per-recipient unique key with the follow-up day
DROP INDEX "Notification_practitionerId_encounterId_type_key";
CREATE UNIQUE INDEX "Notification_practitionerId_encounterId_type_followUpDay_key" ON "Notification"("practitionerId", "encounterId", "type", "followUpDay");
