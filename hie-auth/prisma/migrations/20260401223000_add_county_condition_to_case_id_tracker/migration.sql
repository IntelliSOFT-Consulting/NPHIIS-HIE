-- AlterTable: add countyCode and conditionCode columns to CaseIdTracker
ALTER TABLE "CaseIdTracker" ADD COLUMN "countyCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CaseIdTracker" ADD COLUMN "conditionCode" TEXT NOT NULL DEFAULT '';

-- Drop old unique constraint
DROP INDEX IF EXISTS "CaseIdTracker_countryCode_subCountyCode_key";

-- Create new unique constraint matching updated schema
CREATE UNIQUE INDEX "CaseIdTracker_countryCode_countyCode_subCountyCode_conditionCode_key"
    ON "CaseIdTracker" ("countryCode", "countyCode", "subCountyCode", "conditionCode");

-- Remove defaults after migration (columns are NOT NULL with no default in schema)
ALTER TABLE "CaseIdTracker" ALTER COLUMN "countyCode" DROP DEFAULT;
ALTER TABLE "CaseIdTracker" ALTER COLUMN "conditionCode" DROP DEFAULT;
