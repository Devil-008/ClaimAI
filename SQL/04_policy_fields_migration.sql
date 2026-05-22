-- ============================================================
-- Migration: Add extended fields to policies table
-- Run once in MySQL Workbench
-- ============================================================

USE claims_automation_db;

ALTER TABLE policies
  ADD COLUMN IF NOT EXISTS policyholder_name  VARCHAR(200)   NULL AFTER policyholder_id,
  ADD COLUMN IF NOT EXISTS date_of_birth      DATE           NULL AFTER policyholder_name,
  ADD COLUMN IF NOT EXISTS nominee_name       VARCHAR(200)   NULL AFTER date_of_birth,
  ADD COLUMN IF NOT EXISTS insurance_company  VARCHAR(200)   NULL AFTER nominee_name,
  ADD COLUMN IF NOT EXISTS plan_name          VARCHAR(200)   NULL AFTER insurance_company,
  ADD COLUMN IF NOT EXISTS benefits           TEXT           NULL AFTER exclusions,
  ADD COLUMN IF NOT EXISTS raw_extracted_text TEXT           NULL AFTER benefits;

-- Verify
DESCRIBE policies;
