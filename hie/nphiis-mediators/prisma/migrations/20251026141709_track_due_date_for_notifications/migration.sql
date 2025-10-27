/*
  Warnings:

  - You are about to drop the column `patientId` on the `Notification` table. All the data in the column will be lost.
  - Added the required column `dueDate` to the `Notification` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "patientId",
ADD COLUMN     "dueDate" TIMESTAMP(3) NOT NULL;
