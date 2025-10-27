/*
  Warnings:

  - Added the required column `investigationDate` to the `Notification` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "investigationDate" TIMESTAMP(3) NOT NULL;
