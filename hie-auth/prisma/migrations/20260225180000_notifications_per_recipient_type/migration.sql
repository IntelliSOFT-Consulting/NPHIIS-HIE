-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('AFP_FOLLOW_UP', 'CASE_SUBMISSION');

-- Drop old unique constraint (previously enforced one Notification row per encounter)
DROP INDEX IF EXISTS "Notification_encounterId_key";

-- AlterTable: case-submission alerts do not use investigation dates
ALTER TABLE "Notification" ALTER COLUMN "investigationDate" DROP NOT NULL;

ALTER TABLE "Notification" ADD COLUMN "type" "NotificationType" NOT NULL DEFAULT 'AFP_FOLLOW_UP';

CREATE UNIQUE INDEX "Notification_practitionerId_encounterId_type_key" ON "Notification"("practitionerId", "encounterId", "type");
