-- ─────────────────────────────────────────────────────────────
-- 001 — SupportRequests.origin gains 'BENEFICIARY'
--
-- Why: Table 4.1 lists "request support" as a beneficiary capability, but
-- the column only allowed OFFICER and PROVIDER, so a beneficiary had no way
-- to ask for what they need. The application now writes 'BENEFICIARY' as the
-- origin when a beneficiary raises their own request.
--
-- Run this ONCE against the production database BEFORE (or immediately
-- after) deploying the release that adds beneficiary self-service. Until it
-- runs, a beneficiary request fails at the database with a truncation error.
--
-- Safe: widening an ENUM does not touch existing rows, does not drop data,
-- and completes in well under a second on a table of this size.
--
-- Railway: Project IDMS → MySQL service → "Data" tab → Query, and paste.
-- Or locally:  mysql -h <host> -P <port> -u <user> -p <db> < this-file.sql
-- ─────────────────────────────────────────────────────────────

ALTER TABLE `SupportRequests`
  MODIFY `origin` ENUM('OFFICER', 'PROVIDER', 'BENEFICIARY') NOT NULL;

-- Verify (should list all three values):
--   SHOW COLUMNS FROM `SupportRequests` LIKE 'origin';
