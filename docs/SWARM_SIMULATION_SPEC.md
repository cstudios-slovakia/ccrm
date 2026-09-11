# CCRM Swarm Simulation Specification (v1.10-jackfruit)

> **Document Purpose**: Technical architecture and functional specification for integrating an autonomous multi-agent simulation sandbox directly into CCRM.
> **Architecture Pattern**: Client-Orchestrated JavaScript Runtime (React 19 / Browser) + Server-Persisted Checkpointing & History (PHP 8 / MySQL).

---

## 1. Executive Architectural Blueprint

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CLIENT RUNTIME (User's Browser)                       │
│  - Engine: React 19 + Asynchronous Event Loop (Promise Queue / Web Worker)  │
│  - LLM Calls: Parallel browser fetch() to OpenAI / DeepSeek API             │
│  - Visualization: Live Three.js / D3 graph + cascading social media feed    │
│  - Protections: Screen Wake Lock API (prevents sleep) + beforeunload guard   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                         Async JSON Checkpoint Stream
                         (Every Round or Milestone)
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      SERVER PERSISTENCE (PHP 8 + MySQL)                     │
│  - Endpoints: POST /api/swarm/checkpoint, GET /api/swarm/resume             │
│  - Role: Stateless database persistence, zero background queue maintenance  │
│  - Crash Recovery: Resumes interrupted simulations from last saved round    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Core Tenets:
1. **Zero Server Maintenance**: No Python, no Celery, no Redis, no background system daemons. Operates on standard self-hosted LAMP/LEMP stacks.
2. **Crash-Resilient Checkpointing**: After each round $r$ finishes on the client, state is POSTed to the PHP backend. If the browser tab crashes or laptop restarts, the user resumes from round $r+1$ without re-spending LLM tokens.
3. **Immersive "God's View" UX**: Real-time visualization with pulsing graph nodes and live falling tweet/reddit cards keeps the user engaged so they do not close the tab.

---

## 2. CRM Data Ingestion & Temporal Horizon Filtering

### The Problem: The "10-Year Stale Data Trap"
If a company has been running CCRM for 10 years, loading all historical CRM data into the simulation knowledge base introduces fatal flaws:
* **Token Bloat & Astronomical Costs**: Ingesting thousands of outdated contacts, resolved tickets, and dead leads exhausts LLM context windows.
* **Obsolete Business Context**: 8-year-old pricing tiers, discontinued legacy products, and former employees create hallucinated and irrelevant simulation dynamics.
* **Noise Drowning Signal**: Current market reactions depend on recent customer attitudes, active competitors, and current economic conditions.

---

### The Solution: Configurable Temporal Lookback Window

When seeding the simulation from CCRM's database, the ingestion engine applies a strict **Temporal Horizon Filter**:

```
[ All Historical CRM Data (10+ Years) ]
                  │
                  ▼
   ┌─────────────────────────────┐
   │   Temporal Lookback Filter  │  <── Selectable: 6 / 12 / 24 Months
   │   (e.g., created_at >= 12M) │      (Default: Last 12 Months)
   └──────────────┬──────────────┘
                  │
                  ▼
   ┌─────────────────────────────┐
   │  Entity Relevance Filters   │  <── Exclude archived accounts
   │  - Active Leads & Deals     │      Prioritize recent loss reasons
   │  - Top-N Impact Ranking     │      Cap token budget at 50k tokens
   └──────────────┬──────────────┘
                  │
                  ▼
   [ Clean, Recent Simulation Seed ]
```

#### 1. Lookback Window Options

| Mode | Lookback Interval | Recommended Use Case |
| :--- | :--- | :--- |
| **Fast Pulse** | **Last 6 Months** (180 days) | Highly dynamic B2B markets, rapid pricing experiments, or immediate reaction to breaking events. |
| **Standard (Default)** | **Last 12 Months** (365 days) | Standard annual sales cycles, feature launches, license model changes, and modern competitor tracking. |
| **Long Horizon** | **Last 24 Months** (730 days) | Enterprise B2B deals with 12–18 month procurement and RFP cycles. |
| **Custom Range** | User-defined Date Range | Rehearsing historical "What-if" replays or specific seasonal campaigns. |

#### 2. Filtering & Extraction SQL Criteria
```sql
-- Ingestion rule for Clients & Leads
SELECT id, name, company, industry, status, annual_budget, notes
FROM crm_clients
WHERE updated_at >= NOW() - INTERVAL :lookback_months MONTH
  AND status NOT IN ('archived', 'blacklisted', 'duplicate')
ORDER BY lifetime_value DESC
LIMIT 100;

-- Ingestion rule for Historical Objections & Lost Deal Reasons
SELECT d.id, d.title, d.deal_value, d.loss_reason, d.competitor_won, d.closed_at
FROM crm_deals d
WHERE d.status = 'lost'
  AND d.closed_at >= NOW() - INTERVAL :lookback_months MONTH
  AND d.loss_reason IS NOT NULL
ORDER BY d.closed_at DESC
LIMIT 50;
```

#### 3. Token & Budget Safeguards
* **Maximum Context Budget**: The system caps ingested CRM data to **50,000 tokens** maximum.
* **Deduplication & Summarization**: Redundant client profiles are merged into representative **Cohort Clusters** (e.g., *"Mid-market Manufacturing Clients (14 Accounts)"*).

---

## 3. Simulation Input Structure

### Tier 1: Mandatory Core Inputs
1. **Seed Document / Context**: Uploaded PDF, Markdown brief, or direct text announcement.
2. **Prediction Hypothesis / Goal**: The natural-language "What-If" variable (e.g., *"How will clients react to our €1,500 lifetime license and AI Boardroom audio recording?"*).

### Tier 2: Simulation Controls (Smart Defaults)
* **Swarm Scale**: Quick (15 Agents) / Standard (30 Agents) / Deep (60 Agents).
* **Duration**: 5 to 30 Rounds (~24 to 72 simulated hours).
* **Platforms**: Chitchat only / Forum only / Dual-platform (Default).
* **Diurnal Day/Night Cycle**: European (CET) / US / Flat pacing.
* **LLM Model**: Qwen-plus / DeepSeek V3 / GPT-4o-mini.

### Tier 3: CCRM Native Data Injection
* **Lookback Horizon Slider**: `[ 6 Months ] | [ 12 Months (Default) ] | [ 24 Months ]`.
* **CRM Cohorts to Include**:
  * `[✓]` Active Pipeline Leads
  * `[✓]` Existing Retainer Clients
  * `[✓]` Recent Lost Deals (Past 12 Months Objections)
  * `[✓]` Known Direct Competitors logged in CRM

---

## 4. Database Schema: Per-Simulation Sharded Storage Architecture

To maximize reading and writing speed and prevent index bloat across simulations, storage uses a **hybrid sharded table architecture**:
1. **Master Registry Table (`swarm_simulations`)**: Global registry recording all simulation metadata, lookback window, status, and serialized checkpoint summaries.
2. **Dynamic Per-Simulation Tables (`sim<sim_id>_<tableName>`)**: When a simulation is initialized, dedicated tables are dynamically generated using the naming convention `sim<sim_id>_<tableName>` (e.g. for simulation ID `14` or `a9b2`, tables are `sim14_nodes`, `sim14_edges`, `sim14_agents`, `sim14_posts`).

### Architectural Benefits of `sim<sim_id>_` Table Sharding:
* **Blazing Read Speeds**: Queries never need to filter `WHERE simulation_id = ?` across millions of rows from past runs. Each table only contains the active simulation's dataset.
* **Zero Index Contention**: Writing hundreds of posts per round happens in a dedicated small table with negligible lock or B-tree overhead.
* **Instant, Atomic Deletion / Purging**: Deleting an entire simulation run is a simple, non-blocking `DROP TABLE sim<sim_id>_nodes, sim<sim_id>_edges, sim<sim_id>_agents, sim<sim_id>_posts`, avoiding expensive `DELETE FROM` fragmentation in MySQL/InnoDB.
* **Seamless Export & Archiving**: Individual simulation tables can be dumped or converted to standalone SQLite files with zero extraction filtering.

---

### Master Registry Table
```sql
CREATE TABLE swarm_simulations (
    id VARCHAR(36) PRIMARY KEY,              -- e.g. '14' or 'a9b2c3d4'
    table_prefix VARCHAR(50) NOT NULL,       -- e.g. 'sim14_' or 'sima9b2_'
    title VARCHAR(255) NOT NULL,
    hypothesis TEXT NOT NULL,
    seed_document MEDIUMTEXT,
    lookback_months INT DEFAULT 12,
    swarm_scale INT DEFAULT 30,
    total_rounds INT DEFAULT 15,
    current_round INT DEFAULT 0,
    status ENUM('draft', 'prepared', 'running', 'paused', 'completed', 'failed') DEFAULT 'draft',
    checkpoint_state LONGTEXT NULL,          -- Serialized JSON snapshot for crash recovery
    final_report MEDIUMTEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX (status),
    INDEX (created_at)
);
```

---

### Dynamic Per-Simulation Sharded Tables (Created at Initialization)

```sql
-- 1. Knowledge Graph Nodes (Entities)
-- Table Name: sim<sim_id>_nodes (e.g. sim14_nodes)
CREATE TABLE sim<sim_id>_nodes (
    id VARCHAR(36) PRIMARY KEY,
    entity_name VARCHAR(150) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,      -- 'Client', 'Competitor', 'Regulator'
    summary TEXT,
    attributes JSON,
    source_crm_id VARCHAR(50) NULL          -- References crm_clients.id if imported
);

-- 2. Knowledge Graph Edges (Relationships & Temporal Evolution)
-- Table Name: sim<sim_id>_edges (e.g. sim14_edges)
CREATE TABLE sim<sim_id>_edges (
    id VARCHAR(36) PRIMARY KEY,
    source_node_id VARCHAR(36) NOT NULL,
    target_node_id VARCHAR(36) NOT NULL,
    relation_name VARCHAR(100) NOT NULL,    -- 'CRITICIZES', 'LICENSES', 'REGULATES'
    fact TEXT,
    valid_from_round INT DEFAULT 0,
    invalid_from_round INT NULL,            -- Populated when agent beliefs shift
    INDEX (source_node_id),
    INDEX (target_node_id)
);

-- 3. Simulated Agent Personas
-- Table Name: sim<sim_id>_agents (e.g. sim14_agents)
CREATE TABLE sim<sim_id>_agents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    agent_index INT NOT NULL,
    username VARCHAR(100) NOT NULL,
    display_name VARCHAR(150) NOT NULL,
    profession VARCHAR(100),
    mbti VARCHAR(4),
    stance VARCHAR(50) DEFAULT 'neutral',   -- 'supportive', 'opposing', 'neutral'
    user_char TEXT NOT NULL,                -- Internal LLM system prompt
    public_bio TEXT,                        -- Public feed bio
    follower_count INT DEFAULT 100
);

-- 4. Social Feed & Trace Log
-- Table Name: sim<sim_id>_posts (e.g. sim14_posts)
CREATE TABLE sim<sim_id>_posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    round_num INT NOT NULL,
    agent_id INT NOT NULL,
    platform VARCHAR(50) NOT NULL DEFAULT 'chitchat', -- 'chitchat' or 'forum'
    action_type ENUM('POST', 'REPOST', 'QUOTE', 'LIKE', 'COMMENT') NOT NULL,
    target_post_id INT NULL,
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (round_num),
    INDEX (agent_id)
);
```

---

## 5. Client-Side Runtime & Checkpoint Protocol

### Checkpoint API (`POST /api/swarm/checkpoint`)
* **Triggered by Client**: At the end of every simulation round.
* **Payload**:
  ```json
  {
    "simulation_id": "sim_98a72b",
    "completed_round": 7,
    "active_agents": [...],
    "round_posts": [...],
    "graph_deltas": [...],
    "metrics": { "sentiment_score": 0.42, "viral_index": 12 }
  }
  ```
* **PHP Action**: Saves posts to `swarm_posts`, updates `current_round = 7`, and serializes the full round snapshot to `checkpoint_state`. Returns `{ "status": "saved", "round": 7 }`.

### Resume API (`GET /api/swarm/resume?simulation_id=sim_98a72b`)
* **Triggered by Client**: On page reload or when reopening a paused simulation.
* **PHP Action**: Returns the complete state of the latest completed round.
* **Client Action**: Re-hydrates React state and immediately begins execution of `completed_round + 1`.

### Browser Safeguards
1. **Screen Wake Lock**:
   `navigator.wakeLock.request('screen')` is acquired on simulation start and released on completion or pause.
2. **Tab Close Protection**:
   `window.addEventListener('beforeunload', ...)` warns the user if an active simulation is in progress.

---

## 6. Secure PHP LLM Streaming Proxy

To ensure complete credential security and eliminate CORS obstacles, the browser client **never** communicates with external LLM APIs directly. All requests route through CCRM's backend proxy:

* **Endpoint**: `POST /api/swarm/llm-proxy` (or `api/swarm-proxy.php`)
* **Security & Auth**:
  * Authenticated by CCRM user session cookies or Bearer token.
  * API keys (OpenAI / DeepSeek / Qwen) are read securely from `config.php` or server environment variables.
  * No secret keys are ever exposed to the client browser.
* **Payload Passthrough**:
  * Accepts standard OpenAI-format request payloads (`model`, `messages`, `response_format`, `temperature`).
  * Forwards via `curl` to the provider and streams or returns the JSON response.

---

## 7. Mandatory Pre-Flight Cost & Token Estimator

Simulations execute hundreds or thousands of LLM calls and can become expensive if misconfigured. CCRM requires a **Mandatory Pre-Flight Cost Modal** displayed before any simulation starts.

### The Estimation Formula:
$$\text{Total Tokens} \approx T_{\text{ontology}} + T_{\text{profiles}} + (A \times R \times T_{\text{turn}}) + T_{\text{report}}$$

Where:
* $T_{\text{ontology}} \approx 3,000 \text{ tokens}$ (document analysis & entity extraction)
* $T_{\text{profiles}} \approx A \times 600 \text{ tokens}$ (agent personality generation)
* $A$ = Number of active agents (e.g. 30)
* $R$ = Number of simulation rounds (e.g. 15)
* $T_{\text{turn}} \approx 450 \text{ tokens}$ (feed reading + action generation per agent per round)
* $T_{\text{report}} \approx 8,000 \text{ tokens}$ (outline planning, tool queries, and multi-section synthesis)

### Pre-Flight Confirmation UI:
```
┌────────────────────────────────────────────────────────────────────────┐
│  ⚠️ Pre-Flight Cost & Resource Estimator                                │
├────────────────────────────────────────────────────────────────────────┤
│  • Agents to simulate:  30 personas                                    │
│  • Duration:            15 rounds (~48 simulated hours)                │
│  • Estimated API calls: ~520 calls                                     │
│  • Estimated Tokens:    ~215,000 tokens                                │
│  • Projected Cost:      $0.09 (DeepSeek V3)  |  $0.32 (GPT-4o-mini)   │
│                                                                        │
│  [✓] I understand this simulation will consume API quota.              │
├────────────────────────────────────────────────────────────────────────┤
│  [ Cancel / Adjust Parameters ]                  [ Confirm & Launch ]  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Native Recommendation System (RecSys) Architecture

> **Can OASIS's RecSys be rewritten in PHP or JavaScript?**
> **YES, 100%.** In Python OASIS, the recommendation algorithm is not complex deep learning; it is a straightforward **multi-factor linear ranking function** over candidate posts. We can implement this in 40 lines of native code (in JavaScript for instant client execution or in PHP during checkpointing).

### The Ranking Equation:
$$\text{Score}(p, i) = w_r \cdot \text{Recency}(p) + w_p \cdot \text{Popularity}(p) + w_s \cdot \text{Relevance}(p, i)$$

* **Recency Component ($w_r = 0.4$)**:
  $$\text{Recency}(p) = \frac{1}{\text{Current Round} - \text{Post Round} + 1}$$
* **Popularity Component ($w_p = 0.3$)**:
  $$\text{Popularity}(p) = \log(1 + \text{likes} + 2 \cdot \text{quotes} + 2 \cdot \text{comments})$$
* **Relevance Component ($w_s = 0.3$)**:
  Keyword / industry cohort match between agent $i$'s `interested_topics` and post keywords.

### Feed Generation Rule:
Each agent's feed per round is strictly limited to the **Top 5 to 7 highest-scoring posts**, keeping prompt token counts lean and focused.

---

## 9. Deductive Report Structure & Strategic Playbook

When the simulation completes, the **Chief Analyst Agent** compiles a formal report with a mandatory strategic focus:

### Required Report Sections:
1. **Executive Consensus vs. Market Polarization**:
   * Initial vs final sentiment trajectory.
   * Adoption likelihood breakdown across customer tiers.
2. **Critical Vulnerabilities & Top Objections**:
   * The fatal objections raised by prospects (e.g. data privacy, license renewal doubts).
   * Exact verbatim quotes from simulated buyer personas.
3. **Competitor Counter-Strategy Analysis**:
   * How existing competitors reacted and spread FUD to protect their market share.
4. **🎯 "What Strategy to Use to Achieve the Goal?" (Mandatory Strategic Playbook)**:
   * **Actionable Counter-Measures**: Specific adjustments to pricing, contract wording, or feature packaging to neutralize the objections discovered in the simulation.
   * **Sales Objection Playbook**: Direct rebuttals for account executives to use when real-world prospects raise the concerns uncovered by the swarm.
   * **Go-To-Market Sequence**: Recommended timeline and communication angles for maximum adoption.

### Interactive Q&A Chatbot ("Ask the Chief Analyst")
Alongside the static report, an interactive chat drawer allows the executive to cross-examine the simulation:
* User asks: *"Why did mid-market buyers reject the €1,500 license in Round 11?"*
* Chatbot queries the `sim<sim_id>_posts` and `sim<sim_id>_edges` tables, retrieving supporting evidence and providing direct citations.

---

## 10. UI Placement & Visual Identity in CCRM

### Navigation Item:
* **Placement**: CCRM Main Navigation Sidebar.
* **Label**: **SAI** (Swarm Artificial Intelligence).
* **Icon**: **Flying flock of birds** (representing swarm intelligence and collective alignment).
  * Implemented with SVG birds flying in V-formation or dynamic Lucide icon.
* **Color Identity**: **Purple to Green Gradient**
  * Tailwind CSS Token: `bg-gradient-to-r from-purple-600 via-indigo-500 to-emerald-400`
  * Glow Effect: Purple/Emerald ambient backlighting when a simulation is running.

