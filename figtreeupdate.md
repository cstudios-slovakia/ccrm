# Fig Tree 1.5.x "Fig Tree" Release Update Log

This document outlines the design, database migration details, and upgrade instructions for upgrading the CRM system to 1.5.x, code-named **Fig Tree**.

---

## 1. Goal & Features
The core theme of the Fig Tree release is **Dynamic Document Previews & Meeting Lifecycle Management**. The key updates include:
1. **Interactive Meeting Archival**: Added a styled `Archive` button directly on the meetings list screen to archive meeting logs.
2. **RAG Server Integration Filtering**: Filter out archived meeting notes from both training index datasets and real-time RAG context retrieval queries.
3. **Interactive File Pills**: Automatically detect document names (like `Receipt-2723-3177-3915.pdf`) in chat window responses and render them as beautiful, clickable pills with modal previews/downloads.

---

## 2. Database Schema Details

Archived state uses the `archived` column added to the `meeting_notes` table in the MariaDB/MySQL database.
The sync endpoints exclude archived entries from the RAG indexing system:
```sql
SELECT `id`, `title`, `notes`, `lead_name`, `ai_summary_json` 
FROM `meeting_notes` 
WHERE (`archived` = 0 OR `archived` IS NULL)
```

---

## 3. Deployment & Verification Plan

1. **Local Build**: Run `npm run build` to package frontend TSX code and copy API updates to `dist/`.
2. **Docker Rebuild**: Rebuild docker images so the active containers run with the updated release assets:
   ```bash
   docker compose up --build -d
   ```
