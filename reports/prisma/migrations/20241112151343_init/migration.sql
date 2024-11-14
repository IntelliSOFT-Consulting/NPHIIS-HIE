-- CreateTable
CREATE TABLE "primary_immunization_dataset" (
    "id" SERIAL NOT NULL,
    "patient_id" VARCHAR(50) NOT NULL,
    "document_id" VARCHAR(50),
    "document_type" VARCHAR(50),
    "family_name" VARCHAR(100),
    "given_name" VARCHAR(100),
    "birth_date" TIMESTAMP(3),
    "gender" VARCHAR(20),
    "age_years" INTEGER,
    "age_months" INTEGER,
    "age_group" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_deceased" BOOLEAN NOT NULL DEFAULT false,
    "is_multiple_birth" BOOLEAN,
    "phone_primary" VARCHAR(50),
    "phone_secondary" VARCHAR(50),
    "guardian_relationship" VARCHAR(50),
    "guardian_name" VARCHAR(100),
    "guardian_phone" VARCHAR(50),
    "county" VARCHAR(100),
    "subcounty" VARCHAR(100),
    "ward" VARCHAR(100),
    "facility_name" VARCHAR(500),
    "facility_code" VARCHAR(50),
    "vaccine_code" VARCHAR(50),
    "vaccine_name" VARCHAR(100),
    "vaccine_category" VARCHAR(50),
    "dose_number" INTEGER,
    "series_name" VARCHAR(100),
    "schedule_due_date" TIMESTAMP(3),
    "administered_date" TIMESTAMP(3),
    "days_from_due_date" INTEGER,
    "administration_location" VARCHAR(200),
    "batch_number" VARCHAR(50),
    "immunization_status" VARCHAR(50),
    "is_defaulter" BOOLEAN,
    "defaulter_days" INTEGER,
    "target_disease" VARCHAR(200),
    "disease_category" VARCHAR(100),
    "record_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "record_updated_at" TIMESTAMP(3) NOT NULL,
    "patient_last_updated" TIMESTAMP(3),
    "data_source" VARCHAR(50),

    CONSTRAINT "primary_immunization_dataset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "primary_immunization_dataset_patient_id_idx" ON "primary_immunization_dataset"("patient_id");

-- CreateIndex
CREATE INDEX "primary_immunization_dataset_document_id_idx" ON "primary_immunization_dataset"("document_id");

-- CreateIndex
CREATE INDEX "primary_immunization_dataset_document_type_idx" ON "primary_immunization_dataset"("document_type");

-- CreateIndex
CREATE INDEX "primary_immunization_dataset_county_idx" ON "primary_immunization_dataset"("county");

-- CreateIndex
CREATE INDEX "primary_immunization_dataset_subcounty_idx" ON "primary_immunization_dataset"("subcounty");

-- CreateIndex
CREATE INDEX "primary_immunization_dataset_vaccine_code_idx" ON "primary_immunization_dataset"("vaccine_code");

-- CreateIndex
CREATE INDEX "primary_immunization_dataset_immunization_status_idx" ON "primary_immunization_dataset"("immunization_status");

-- CreateIndex
CREATE INDEX "primary_immunization_dataset_is_defaulter_idx" ON "primary_immunization_dataset"("is_defaulter");
