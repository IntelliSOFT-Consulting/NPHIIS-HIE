-- CreateEnum
CREATE TYPE "SubscriptionCallbackOutcome" AS ENUM ('success', 'error', 'skipped');

-- CreateTable
CREATE TABLE "FhirSubscriptionCallbackLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "route" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "httpStatus" INTEGER NOT NULL,
    "outcome" "SubscriptionCallbackOutcome" NOT NULL,
    "errorMessage" TEXT,
    "detail" JSONB,
    "durationMs" INTEGER,

    CONSTRAINT "FhirSubscriptionCallbackLog_pkey" PRIMARY KEY ("id")
);
