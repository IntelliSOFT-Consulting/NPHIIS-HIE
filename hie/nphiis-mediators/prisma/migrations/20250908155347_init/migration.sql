-- CreateTable
CREATE TABLE "CaseIdTracker" (
    "id" SERIAL NOT NULL,
    "countryCode" TEXT NOT NULL,
    "subCountyCode" TEXT NOT NULL,
    "lastCaseId" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CaseIdTracker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CaseIdTracker_countryCode_subCountyCode_key" ON "CaseIdTracker"("countryCode", "subCountyCode");
