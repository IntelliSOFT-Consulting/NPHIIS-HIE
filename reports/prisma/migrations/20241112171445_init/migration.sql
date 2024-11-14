-- AlterTable
ALTER TABLE "primary_immunization_dataset" ADD COLUMN     "county_code" VARCHAR(50),
ADD COLUMN     "subcounty_code" VARCHAR(50),
ADD COLUMN     "ward_code" VARCHAR(50);
