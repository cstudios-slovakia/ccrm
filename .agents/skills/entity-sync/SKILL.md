---
name: "entity-sync"
description: "Syncs database entity changes to entities_overview.md"
---

# Entity Sync Skill

This skill enforces database schema documentation integrity in this workspace.

## Context
The CCRM workspace uses a central database overview document at `entities_overview.md`.
All database table structures and dynamic schema details are declared programmatically in `api/schema.php` and `sync.php`.

## Instructions for Agents
Whenever you:
1. Create a new database table or junction table
2. Alter or add columns to existing tables
3. Modify default system settings or dynamic tables structure

You MUST immediately:
1. Open and update [entities_overview.md](file:///Users/erik/Documents/vibe%20coding/crm/entities_overview.md) to document the new table/column names, types, descriptions, and relations.
2. Commit the changes to git as part of your task.
