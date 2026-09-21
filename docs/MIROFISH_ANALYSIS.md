# MiroFish: Deep Architectural & Functional Analysis

> **Executive Summary**: **MiroFish** is a multi-agent swarm intelligence prediction engine designed to simulate and forecast complex real-world social, political, market, and narrative outcomes. By taking unstructured real-world materials (e.g., product launch briefs, news reports, policy proposals) as "seeds", it automatically synthesizes a high-fidelity digital society of autonomous LLM agents with individual personas, social relations, and dynamic memory. It then executes parallel social platform simulations (Twitter and Reddit), feeds evolving actions back into a temporal knowledge graph, and deploys a ReAct-based analytical agent to synthesize predictive reports and facilitate live post-simulation interviews.

---

## 1. System Overview & Technology Stack

```
                                  [ User Input ]
                         (Seed Text / PDF + Requirement)
                                        │
                                        ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ STEP 1: GRAPH BUILDING (Ontology Generation + Knowledge Graph Ingestion)    │
 │ - LLM Domain Analysis  ──► Dynamic Entity & Edge Types (PascalCase/SNAKE)   │
 │ - Document Chunking    ──► Zep Cloud Graphiti / LocalGraphStore Ingestion   │
 └──────────────────────────────────────┬──────────────────────────────────────┘
                                        │
                                        ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ STEP 2: ENVIRONMENT SETUP (Agent Personas + Simulation Config)              │
 │ - Zep Entity Enrichment ──► OASIS Agent Profiles (Twitter CSV / Reddit JSON)│
 │ - LLM Auto-Config       ──► Diurnal Cycle, Stances, Activity, Events        │
 └──────────────────────────────────────┬──────────────────────────────────────┘
                                        │
                                        ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ STEP 3: PARALLEL SWARM SIMULATION (CAMEL-AI OASIS Engine)                   │
 │ - Subprocess Execution: Twitter & Reddit Parallel Environments              │
 │ - Trace Logging: SQLite (Posts, Likes, Quotes, Comments, Follows)           │
 │ - Live Temporal Graph Update: Natural language episode stream into Zep       │
 └──────────────────────────────────────┬──────────────────────────────────────┘
                                        │
                                        ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ STEP 4: REPORT AGENT (Analytical ReAct Synthesis)                           │
 │ - Outline Planning & Section-by-Section Deductive Generation                │
 │ - Toolset: InsightForge (Sub-queries), PanoramaSearch, QuickSearch          │
 └──────────────────────────────────────┬──────────────────────────────────────┘
                                        │
                                        ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ STEP 5: DEEP INTERACTION (Live Sandbox & Cross-Examination)                 │
 │ - File-based IPC (Commands / Responses) keeping OASIS environment alive     │
 │ - Direct 1-on-1 and Batch Agent Interviews + ReportAgent Conversational Q&A │
 └─────────────────────────────────────────────────────────────────────────────┘
```

### Core Technologies

| Layer | Component | Technologies Used | Key Responsibilities |
| :--- | :--- | :--- | :--- |
| **Frontend UI** | Web Application | Vue 3, Vite, Vue Router, Vue I18n, D3.js, Axios | 5-step workflow wizard, D3 force-directed knowledge graph visualization, real-time simulation monitor, interactive report & agent chat. |
| **Backend API** | Application Server | Python 3.11+, Flask 3, Pydantic, python-dotenv | REST endpoints for graph operations, project status management, task queueing, simulation orchestration, and SSE log streaming. |
| **Swarm Engine**| Multi-Agent Platform| `camel-oasis` (v0.2.5), `camel-ai` (v0.2.78), SQLite | Simulates Twitter and Reddit social environments; executes autonomous agent behaviors, recommendations, feeds, and graph topologies. |
| **Memory / Graph**| Temporal Knowledge Base| `zep-cloud` (v3.25.0) / Graphiti, `LocalGraphStore` fallback | Long-term episodic memory, entity-relationship extraction, temporal invalidation (`valid_at`, `invalid_at`, `expired_at`). |
| **LLM Gateway** | Inference Engine | OpenAI Python SDK | Drives agent reasoning, ontology extraction, profile generation, and ReportAgent. Compatible with OpenAI, DashScope/Qwen, DeepSeek, etc. |

---

## 2. Detailed Breakdown of the 5-Stage Pipeline

### Step 1: Graph Building (Seed Extraction & GraphRAG)

1. **Input Ingestion**:
   - Users upload raw documents (`.pdf`, `.md`, `.txt`) and formulate a **Simulation Requirement** (e.g., *"Predict market adoption and competitor backlash for CCRM v1.6"*).
   - `FileParser` extracts text; `PyMuPDF` parses PDFs; character encoding is normalized via `charset-normalizer`/`chardet`.
2. **Ontology Generation (`ontology_generator.py`)**:
   - The LLM acts as an ontology architect. It evaluates the domain and generates domain-specific **Entity Types** (e.g., `Client`, `Competitor`, `GovernmentAgency`, `ProjectManager`) and **Edge Types** (e.g., `CRITICIZES`, `LICENSES`, `ADOPTS`).
   - **Critical Architectural Rule**: The system strictly forbids abstract concepts (like *"Sentiment"* or *"Trends"*) as entities. Every entity must represent an active social participant capable of posting, reacting, or influencing decisions.
3. **Graph Construction (`graph_builder.py` & `local_graph_service.py`)**:
   - Text is segmented into chunks (`DEFAULT_CHUNK_SIZE = 500`, `CHUNK_OVERLAP = 50`).
   - In standard mode, chunks and ontology definitions are pushed to **Zep Cloud** in batches (`batch_size = 350`) to construct a Standalone Knowledge Graph.
   - **Local Fallback Mode**: If Zep Cloud is unavailable, `LocalGraphStore` uses local LLM extraction and persists node/edge definitions to disk as JSON (`uploads/graphs/mirofish_local_<id>.json`), enabling offline development.

---

### Step 2: Environment Setup (Persona Generation & Config Injection)

Before launching the simulation, the graph entities must be converted into playable characters:

1. **Agent Profile Synthesis (`oasis_profile_generator.py`)**:
   - For each entity in the graph, the generator executes secondary Zep searches to gather relevant contextual facts.
   - Generates an `OasisAgentProfile`:
     - **Identity**: `name`, `user_name`, `bio`, `persona`.
     - **Demographics & Psychology**: `age`, `gender`, `mbti`, `profession`, `country`, `interested_topics`.
     - **Platform Traits**: For Twitter: `follower_count`, `friend_count`, `statuses_count`. For Reddit: `karma`.
     - **Traceability**: Retains `source_entity_uuid` and `source_entity_type` linking directly back to the graph node.
2. **Simulation Parameter Automation (`simulation_config_generator.py`)**:
   - Rather than requiring tedious manual tuning, an LLM infers simulation dynamics from the seed material:
     - **Time & Circadian Cycle (`TimeSimulationConfig`)**: Models diurnal human rhythms (e.g., `CHINA_TIMEZONE_CONFIG` or custom hours), with dead hours (00:00–05:00), working hours, and evening peak hours (19:00–22:00) with activity multipliers.
     - **Individual Agent Configuration (`AgentActivityConfig`)**: Defines each agent's `activity_level` (0.0–1.0), `posts_per_hour`, `comments_per_hour`, `sentiment_bias` (-1.0 to +1.0), initial `stance` (`supportive`, `opposing`, `neutral`, `observer`), and `influence_weight`.
     - **Catalyst Events**: Scheduled external shocks injected into the timeline at designated simulation hours.

---

### Step 3: Swarm Simulation Execution (CAMEL-AI OASIS)

The simulation engine is built upon **OASIS** (*Open Agent Social Interaction Simulations*), run via background subprocesses managed by `SimulationRunner`:

```
              ┌────────────────────────────────────────────────────────┐
              │           SimulationRunner (Flask Subprocess)          │
              └───────────────────────────┬────────────────────────────┘
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  ▼                                               ▼
      ┌─────────────────────────┐                     ┌─────────────────────────┐
      │   Twitter Simulation    │                     │    Reddit Simulation    │
      │   (oasis.TwitterEnv)    │                     │    (oasis.RedditEnv)    │
      └───────────┬─────────────┘                     └───────────┬─────────────┘
                  │                                               │
                  │ Actions: CREATE_POST, LIKE,                   │ Actions: CREATE_POST, COMMENT,
                  │ REPOST, QUOTE, FOLLOW, MUTE                   │ UPVOTE, DOWNVOTE, TREND
                  │                                               │
                  ▼                                               ▼
      ┌─────────────────────────┐                     ┌─────────────────────────┐
      │  twitter_simulation.db  │                     │  reddit_simulation.db   │
      └───────────┬─────────────┘                     └───────────┬─────────────┘
                  │                                               │
                  └───────────────────────┬───────────────────────┘
                                          ▼
                      ┌───────────────────────────────────────┐
                      │    ZepGraphMemoryManager (Updater)    │
                      │  Converts actions to natural language │
                      │  episodes -> updates Knowledge Graph  │
                      └───────────────────────────────────────┘
```

1. **Autonomous Social Behavior**:
   - Agents act round-by-round based on their assigned personas, stances, and the content surfaced by OASIS recommendation feeds.
   - Available actions:
     - **Twitter**: `CREATE_POST`, `LIKE_POST`, `REPOST`, `QUOTE_POST`, `FOLLOW`, `DO_NOTHING`.
     - **Reddit**: `CREATE_POST`, `CREATE_COMMENT`, `LIKE_POST` (upvote), `DISLIKE_POST` (downvote), `SEARCH_POSTS`, `TREND`, `MUTE`.
2. **Persistent Storage**:
   - Every social transaction is persisted locally into platform SQLite databases (`twitter_simulation.db` and `reddit_simulation.db`).
3. **Closed-Loop Temporal Memory Update (`zep_graph_memory_updater.py`)**:
   - **Key Innovation**: The simulation is not an isolated sandbox. As agents post and interact, their actions are translated into natural language statements (e.g., `"[2026-09-10 14:00] [twitter round 3] Erik: Quoted competitor post arguing that €1,500 lifetime licensing is unsustainable"`).
   - These episodes are pushed back into Zep Graph. Zep automatically updates entity relationships, records temporal validity (`valid_at`, `invalid_at`), and marks expired beliefs, allowing the knowledge base to evolve alongside the social simulation.

---

### Step 4: Report Generation (ReAct Analytical Agent)

Once the simulation completes (or reaches a target round), `ReportAgent` (`report_agent.py`) is invoked to extract conclusions and forecast future developments:

1. **Two-Tier Generation**:
   - **Phase A (Outline Planning)**: Produces an analytical structure tailored to the user's initial simulation requirement (Executive Summary, Stakeholder Breakdown, Consensus vs Divergence Points, Risk Analysis, Strategic Recommendations).
   - **Phase B (Section-by-Section ReAct Generation)**: Generates each chapter sequentially using an iterative Reasoning + Acting loop (up to `REPORT_AGENT_MAX_TOOL_CALLS = 5` per section and reflection cycles).
2. **Specialized Analytical Tools (`zep_tools.py`)**:
   - **`InsightForge`**: Performs multi-angle inquiry. Decomposes the primary question into sub-queries, executes parallel graph and semantic searches, extracts entity relation chains, and delivers verified citations.
   - **`PanoramaSearch`**: Traverses both active and historical/invalidated facts to analyze *how opinions shifted over time*.
   - **`QuickSearch`**: Standard targeted vector/keyword search over the simulation database and graph.
3. **Auditing & Live Streaming**:
   - Every thought, observation, tool invocation, and reflection is streamed via SSE and written to `agent_log.jsonl` for full transparency.

---

### Step 5: Deep Interaction (Live Sandbox & Cross-Examination)

Unlike conventional batch simulators that terminate upon completion, MiroFish keeps the environment active:

1. **Non-Blocking IPC Protocol (`simulation_ipc.py`)**:
   - Communication between Flask and the running OASIS simulation scripts occurs via atomic JSON files in `ipc_commands/` and `ipc_responses/`.
   - Supported commands:
     - `interview`: Send a prompt to a specific agent.
     - `batch_interview`: Interview multiple agents simultaneously with the same or tailored prompts.
     - `close_env`: Gracefully terminate the simulation environment and release resources.
2. **User Cross-Examination Capabilities (`Step5Interaction.vue`)**:
   - **Report Agent Chat**: The user can ask high-level questions (*"Why did the client segment turn hostile in Round 12?"*). The ReportAgent queries the graph and SQLite logs to answer.
   - **Agent Interviews**: The user can directly interrogate any agent in the digital world (*"Why did you decide not to renew the license?"*). OASIS executes an `ActionType.INTERVIEW` manual action, causing the specific agent LLM to answer in-character, taking into account everything that occurred during the simulation.

---

## 3. Directory Layout & Architecture Map

```
mirofish/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── graph.py             # Projects, ontology generation, graph building
│   │   │   ├── simulation.py        # Profiles, config, runner lifecycle, interviews
│   │   │   └── report.py            # Report generation, chat, tool endpoints
│   │   ├── models/
│   │   │   ├── project.py           # Project state machine & metadata storage
│   │   │   └── task.py              # Asynchronous task manager
│   │   ├── services/
│   │   │   ├── ontology_generator.py# LLM ontology extraction
│   │   │   ├── graph_builder.py     # Zep Cloud Graphiti ingestion
│   │   │   ├── local_graph_service.py # Zero-cloud local graph fallback
│   │   │   ├── oasis_profile_generator.py # Node-to-Agent profile conversion
│   │   │   ├── simulation_config_generator.py # Diurnal and behavioral auto-config
│   │   │   ├── simulation_runner.py # Subprocess & lifecycle management
│   │   │   ├── simulation_ipc.py    # Command/Response IPC queue
│   │   │   ├── zep_graph_memory_updater.py # Action-to-graph dynamic streamer
│   │   │   ├── report_agent.py      # ReAct report synthesis
│   │   │   └── zep_tools.py         # InsightForge, Panorama, QuickSearch tools
│   │   └── utils/
│   │       ├── zep.py               # Zep client wrapper & caching
│   │       ├── openai_chat_compat.py# Unified LLM provider adapter
│   │       └── file_parser.py       # PDF/Markdown/text extractors
│   ├── scripts/
│   │   ├── run_parallel_simulation.py # Dual-platform runner (Twitter + Reddit)
│   │   ├── run_twitter_simulation.py  # Twitter-only standalone runner
│   │   └── run_reddit_simulation.py   # Reddit-only standalone runner
│   └── run.py                       # Backend Flask entrypoint (port 5001)
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── GraphPanel.vue       # D3.js interactive force-directed graph
│   │   │   ├── Step1GraphBuild.vue  # Document upload & ontology review
│   │   │   ├── Step2EnvSetup.vue    # Profile generation & platform parameters
│   │   │   ├── Step3Simulation.vue  # Real-time simulation dashboard
│   │   │   ├── Step4Report.vue      # Dynamic report generation & log feed
│   │   │   └── Step5Interaction.vue # Agent interviews & conversational audit
│   │   └── views/
│   │       ├── Home.vue             # Project selection & file dropzone
│   │       └── MainView.vue         # Split-screen workbench
│   └── package.json                 # Vue 3 + Vite (port 3000)
│
├── reality-seed.md                  # Test seed: CCRM v1.6 product launch scenario
├── docker-compose.yml               # Container deployment (MiroFish + Zep + pgvector)
└── zep.yaml                         # Local Zep instance configuration
```

---

## 4. Key Strengths & Technical Highlights

1. **Autonomous Parameterization**:
   - Traditional social simulations require tedious manual agent modeling. MiroFish automatically derives entities, personas, stances, posting schedules, and event timings from raw text using structured LLM prompts.
2. **Temporal Dynamic Memory**:
   - Rather than static memory vectors, the integration with Zep creates an evolving timeline where facts become obsolete or contradicted as events unfold.
3. **Two-Platform Convergence**:
   - Modeling both Twitter (fast-paced, broadcasting, viral reposts) and Reddit (deep threaded discussions, upvote/downvote consensus) captures different nuances of public and market opinion.
4. **Live Post-Simulation Interrogation**:
   - The file-based IPC architecture allows users to "pause the world" and interview specific simulated stakeholders, providing qualitative depth beyond aggregated statistical charts.

---

## 5. Practical Considerations & Resource Demands

- **LLM Token Consumption**:
  - Running 20–50 agents over 10–30 rounds across dual platforms can trigger tens of thousands of LLM calls.
  - *Recommendation*: Use efficient, high-throughput models (e.g., Qwen-plus, DeepSeek V3, or GPT-4o-mini).
- **Zep Cloud vs Local Fallback**:
  - Full temporal graph extraction operates best with Zep Cloud or self-hosted Zep + `pgvector`.
  - The local `LocalGraphStore` fallback in the repository provides a simplified node/edge model, which is ideal for testing without external cloud API dependencies.
- **Process Orchestration**:
  - Subprocess execution requires clean termination hooks (handled in `simulation_runner.py` via `atexit` and signal traps) to prevent orphan Python processes when simulations are cancelled.

---

## 6. Relevance to CCRM (v1.10-kiwi)

Notice the existing `reality-seed.md` in `../mirofish`: it explicitly models the **CCRM v1.6 launch** (AI boardroom, €1,500 self-hosted license, GDPR concerns, sales managers vs project managers).

MiroFish is an ideal engine for:
1. **Product Strategy & Pricing Rehearsal**: Simulating market reaction to pricing tiers, licensing shifts, and feature rollouts before public announcement.
2. **Sales Pitch & Negotiation Training**: Rehearsing objection handling with autonomous B2B client agents possessing realistic budget constraints and corporate politics.
3. **AI Swarm Customer Intelligence**: Generating synthetic stakeholder feedback loops and predictive customer journey models directly inside CCRM.
