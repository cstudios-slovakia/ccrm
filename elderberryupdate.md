# Elderberry 1.4.x "Elderberry" Release Update Log

This document outlines the design, database migration details, and upgrade instructions for upgrading the CRM system to 1.4.x, code-named **Elderberry**.

---

## 1. Goal & Features
The core theme of the Elderberry release is **Interactive Timelines & AI Automation**. The key updates include:
1. **AI client & Lead Summaries**: Automatically generates and stores an AI summary card (purple card with brain icon) for each Lead or Client based on Tasks, Events, Price Offers, and other details.
2. **Timeline Email Details Slideout**: Clicking synchronized email timeline events opens a full top-down viewport drawer showing the complete parsed email thread (sandboxed in an iframe).
3. **Database Portability & Schema Migration**: Integrated automated SQL migrations inside `schema.php` to seamlessly mutate older database setups on `composer update`.

---

## 2. Database Schema Migrations

During `composer update`, the `CCRM\ComposerPlugin` automatically invokes the database schema engine defined in [schema.php](file:///public/api/schema.php). The following idempotency checks and table modifications are executed:

### A. New Database Tables
- **`email_summaries`**: Persists AI-generated summaries of email threads to avoid redundant LLM computation.
  ```sql
  CREATE TABLE IF NOT EXISTS `email_summaries` (
    `user_email` VARCHAR(150) NOT NULL,
    `folder` VARCHAR(100) NOT NULL,
    `email_uid` VARCHAR(150) NOT NULL,
    `summary` TEXT NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`user_email`, `folder`, `email_uid`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  ```

### B. In-Place Table Schema Mutations (ALTERs)
To upgrade older versions (e.g. Clementine 1.2.x or Durian 1.3.x) in-place without data loss, the migration runner applies the following changes:

1. **`leads` Table**:
   - Added `ai_summary` (`TEXT NULL`) column to store the cached summaries.
   - Added `ai_summary_fingerprint` (`TEXT NULL`) column to detect source data modifications and trigger summary updates.
2. **`tasks` & `meeting_tasks` Tables**:
   - Added `start_date` (`DATE NULL`) column for schedule planning.
3. **`meeting_notes` Table**:
   - Added `audio_file` (`VARCHAR(255) NULL`) for recorded meetings.
   - Added `transcription` (`LONGTEXT NULL`) for speech-to-text integration.
   - Added `automated_notes` (`LONGTEXT NULL`) for AI meeting processing.

---

## 3. Deployment & Verification Plan

1. **Composer Upgrade**: Run `composer update` on the consumer target platform.
2. **Production Bundle Verification**:
   - Run `npm run build` to output the latest optimized package files under the `dist/` directory.
3. **Container Rebuilds**:
   - Deploy/restart active nodes using `docker compose up --build -d`.
4. **Layout Verification**:
   - Open a lead or client detail view, locate a synced email timeline card, click it, and ensure the React Portal slideout drawer displays properly on top of the sticky navigation header bar.
