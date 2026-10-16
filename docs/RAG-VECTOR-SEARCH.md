# RAG vector search

The assistant answers from two sources that are merged into one prompt:

1. **Semantic retrieval (vector search)** — the records closest *in meaning* to the question.
   New in 1.12.x. Needs the MariaDB vector database and an OpenAI key.
2. **The keyword context** — `build_comprehensive_crm_rag_context()` in `api/agent_utils.php`,
   which scans each module for the words in the question. Unchanged; it is also all there is
   when the vector index is off or still empty.

Before this, "Train" in Settings only printed log lines ("Stored 3 vectors") and stored nothing.
The configured MariaDB was used purely as a place for chat history, agents and decisions.

## How it works

| Piece | File | What it does |
|---|---|---|
| Index | `api/vector_index.php` | Collects records, cuts them into ~1,400-character chunks, embeds them (`text-embedding-3-small`, 768 dimensions) and stores them in `rag_chunks` (MariaDB `VECTOR` + HNSW, cosine). |
| Training | `api/train_vector.php` (`action: train`) | Step 0 compares the CRM with the index by content hash and queues only new or changed records, and drops records that no longer exist. Each following call embeds as many queued records as fit in ~20 s. The Settings loop is unchanged. |
| Chat | `api/chat_rag.php` | Embeds the (masked) question, takes the nearest chunks the caller may read and adds them to the prompt before the keyword context. The reply carries `vector_hits`. |

Indexed: leads and clients, timeline e-mails/notes/offers/calls, meeting notes, tasks, finance
rows, offers and invoices, projects, unified entries, warehouse items, employees, payroll, leave.
Not indexed: archived records, attachments' contents, the mailbox itself.

## Privacy

The text sent to OpenAI for an embedding is masked with the chat's own dictionary (client names,
e-mails and phone numbers become `[CLIENT_NAME_n]` etc.). The raw text stays in the customer's
database. Masking uses the placeholder numbering at index time; when clients are added and the
numbering shifts, the affected chunks change hash and are re-embedded on the next training run.

## Permissions

Each chunk stores the permission key a reader needs (`perm`) and optionally a second one
(`perm2`): payroll needs `employees.salaries`, a finance row that is a salary needs it too,
e-mails need `email`, a lead's timeline needs `leads` or `clients` depending on the lead.
A search returns a chunk only if the caller's scope grants both, and tasks are limited to those
the caller may see. `ccrm_vec_search()` first takes the 80 nearest chunks from the HNSW index
(which cannot be combined with a `WHERE`), filters them, and for a restricted caller who is left
with too few asks again with an exact, permission-filtered query.

## Operating it

- Settings → AI integrations: vector DB = MariaDB, host/port/user/database, validate, save, then
  **Train**. Re-run Train after large imports; an unchanged CRM costs nothing (0 embeddings).
- Cost: embeddings are about 0.02 USD per million tokens — a few cents for tens of thousands of
  records.
- MariaDB limits the primary key of a vector-indexed table to 256 bytes, so `rag_chunks` uses a
  numeric id.
- Qdrant and Pinecone are still only pinged by "validate"; indexing and search run on MariaDB.
- Measured on a VPS (10 vCPU): 50,000 vectors of 768 dimensions = 226 MB, HNSW search 6 ms,
  exact permission-filtered search 13–36 ms.

Offline checks: `npm run test:vector`.
