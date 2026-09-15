---
description: News, release notes, and product update entries must be managed exclusively through Craft CMS
---

# News & Product Updates Architecture

## 1. Managed Exclusively via Craft CMS

- All news items, release notes, and product update entries are fetched dynamically from Craft CMS via GraphQL (`entries(section: "updateNotes", site: "*")`).
- Multi-language localization (`sk`, `default`, `en`, `hu`) is handled via Craft CMS sites.

## 2. No Hardcoded or Local DB Entries

- News and update entries must NEVER be hardcoded in frontend source files.
- News and update entries must NEVER be stored in the application's local MySQL/SQLite database.
