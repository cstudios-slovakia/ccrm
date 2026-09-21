# MiroFish: The Complete Comprehensive System Reference & Study Guide
*Optimized for ingestion, deep semantic querying, and audio synthesis in Google NotebookLM*

---

## Table of Contents
1. [Comprehensive Technical Lexicon & Glossary](#1-comprehensive-technical-lexicon--glossary)
2. [Foundational Paradigm: Why Swarm Simulation Outperforms Static LLM Prompting](#2-foundational-paradigm-why-swarm-simulation-outperforms-static-llm-prompting)
3. [System Architecture Overview & Data Flow](#3-system-architecture-overview--data-flow)
4. [Step 1: Document Ingestion, Ontology Generation & Graph Construction](#4-step-1-document-ingestion-ontology-generation--graph-construction)
5. [Step 2: Agent Persona Synthesis & Environmental Parameterization](#5-step-2-agent-persona-synthesis--environmental-parameterization)
6. [Step 3: Swarm Simulation Execution (CAMEL-AI OASIS Engine)](#6-step-3-swarm-simulation-execution-camel-ai-oasis-engine)
7. [Step 4: Analytical ReAct Report Agent & Tool Suite](#7-step-4-analytical-react-report-agent--tool-suite)
8. [Step 5: Post-Simulation Live Sandbox & Inter-Process Communication (IPC)](#8-step-5-post-simulation-live-sandbox--inter-process-communication-ipc)
9. [Frontend Visualization: D3 Force-Directed Graph & Split Workbench](#9-frontend-visualization-d3-force-directed-graph--split-workbench)
10. [Mathematical, Behavioral & Algorithmic Formulations](#10-mathematical-behavioral--algorithmic-formulations)
11. [Concrete Case Study: The CCRM v1.6 Product Launch Scenario](#11-concrete-case-study-the-ccrm-v16-product-launch-scenario)
12. [System Limitations, Failure Modes & Engineering Trade-offs](#12-system-limitations-failure-modes--engineering-trade-offs)

---

## 1. Comprehensive Technical Lexicon & Glossary

To understand MiroFish at an academic and engineering level, every technical concept must be rigorously defined within the context of agentic AI, swarm dynamics, and knowledge retrieval.

### Core Paradigms & Multi-Agent Theory

* **Swarm Intelligence (Rajintelligencia)**:
  * *Definition*: The collective, decentralized behavior of self-organized agents interacting locally with one another and with their shared environment.
  * *MiroFish Context*: Rather than asking a single LLM to guess what society will do, MiroFish instantiates hundreds of lightweight LLM agents representing diverse societal segments. Macro-scale phenomena (e.g., product adoption curves, viral panics, boycott coalitions) emerge spontaneously from micro-scale interactions without top-down scripting.

* **Multi-Agent Systems (MAS)**:
  * *Definition*: A computerized system composed of multiple interacting intelligent agents that operate with bounded rationality, private goals, and localized information horizons.
  * *MiroFish Context*: MiroFish deploys heterogeneous agents that act simultaneously on social feeds, making decisions based on their assigned personas and previous interaction histories.

* **Emergence (Emergencia)**:
  * *Definition*: Complex patterns, behaviors, or properties arising in a collaborative system that cannot be predicted merely by analyzing individual components in isolation.
  * *MiroFish Context*: An individual agent may have a minor concern about data privacy. When hundreds of agents interact, that minor concern can amplify via social feedback loops into an organized market boycott.

* **Parallel Digital Sandbox (Párhuzamos Digitális Szimulációs Környezet)**:
  * *Definition*: A self-contained, high-fidelity synthetic reality running in software, populated by virtual actors where external experimental variables can be injected with zero real-world risk.
  * *MiroFish Context*: Before releasing a controversial software pricing update or government policy, decision-makers test it inside MiroFish to preview the backlash or market reception.

---

### Graph Architecture & Memory Engines

* **Knowledge Graph (KG - Tudásgráf)**:
  * *Definition*: A structured representation of real-world entities (nodes) and their semantic relationships (edges), organized according to a formal ontology.
  * *MiroFish Context*: MiroFish extracts all stakeholders, companies, historical facts, and regulatory constraints from raw documents into a knowledge graph to serve as the ground-truth memory base for the simulation.

* **Ontology (Ontológia)**:
  * *Definition*: A formal naming and definition of the types, properties, and interrelationships of the entities that exist in a particular domain of discourse.
  * *MiroFish Context*: MiroFish dynamically generates a domain-specific ontology for each project. It defines **Entity Types** (e.g., `Client`, `Competitor`, `RegulatoryAgency`) and **Edge Types** (e.g., `CRITICIZES`, `LICENSES`, `SUES`). It strictly restricts entity types to active societal actors, forbidding abstract concepts like "sentiment" or "idea".

* **GraphRAG (Graph-Augmented Retrieval-Augmented Generation)**:
  * *Definition*: An advanced RAG paradigm that combines vector embeddings with knowledge graph traversals, allowing an LLM to retrieve interconnected facts, multi-hop relationships, and community summaries.
  * *MiroFish Context*: Used by both the agent persona generator and the final ReportAgent to trace structural chains of influence rather than just searching for raw text matches.

* **Bi-temporal Knowledge Graph & Temporal Validity**:
  * *Definition*: A graph architecture that records not only the structure of relationships, but the specific valid time intervals during which each statement was true in the world (`valid_at`, `invalid_at`, `expired_at`).
  * *MiroFish Context*: MiroFish's memory provider (**Zep / Graphiti**) supports temporal expiration. If an agent shifts their stance from `SUPPORT` to `OPPOSE` during round 10, the previous relationship is marked invalid with an expiration timestamp, preserving the historical trajectory of public opinion.

* **Episodic Memory Stream (Epizodikus Memóriafolyam)**:
  * *Definition*: A continuous chronological log of agent observations and actions, formatted in natural language and committed to long-term memory.
  * *MiroFish Context*: Implemented in `zep_graph_memory_updater.py`. Every tweet, quote, retweet, and reddit comment is converted into an episodic sentence and committed back to Zep to evolve the graph dynamically during the simulation.

---

### Social Simulation Engine & CAMEL-AI

* **CAMEL-AI (Communicative Agents for "Mind" Exploration)**:
  * *Definition*: An open-source research framework and multi-agent communication library developed for autonomous agent exploration and role-playing interactions.
  * *MiroFish Context*: The foundational software stack that MiroFish builds upon for agent communication protocols and model abstraction.

* **OASIS (Open Agent Social Interaction Simulations)**:
  * *Definition*: A specialized multi-agent social network simulation platform developed by CAMEL-AI that recreates platforms like Twitter and Reddit in memory and SQLite.
  * *MiroFish Context*: MiroFish's core simulation runtime (`oasis.make`, `TwitterEnv`, `RedditEnv`). OASIS manages the platform databases, user feeds, recommendation algorithms, and agent action execution.

* **Agent Profile (`OasisAgentProfile`)**:
  * *Definition*: The structured data bundle defining an agent's digital identity, platform metrics, and psychographics.
  * *MiroFish Context*:
    * `user_char`: The internal LLM system prompt detailing character background, biases, goals, and communication quirks.
    * `description` / `bio`: The public-facing biography seen by other agents.
    * `follower_count` / `karma`: Influence capital governing recommendation weights.
    * `mbti`, `profession`, `age`: Demographic constraints ensuring cognitive diversity.

* **Action Space (Cselekvési Tér)**:
  * *Definition*: The complete set of valid discrete decisions an agent can select during their turn.
  * *MiroFish Context*:
    * **Twitter**: `CREATE_POST`, `LIKE_POST`, `REPOST`, `QUOTE_POST`, `FOLLOW`, `DO_NOTHING`.
    * **Reddit**: `CREATE_POST`, `CREATE_COMMENT`, `LIKE_POST` (upvote), `DISLIKE_POST` (downvote), `SEARCH_POSTS`, `SEARCH_USER`, `TREND`, `REFRESH`, `MUTE`, `DO_NOTHING`.

* **Recommendation Algorithm (RecSys) in OASIS**:
  * *Definition*: The algorithmic scoring function that ranks which posts from other agents appear on a given agent's timeline.
  * *MiroFish Context*: Configured in `PlatformConfig` using three weighted factors:
    $$\text{Score} = w_{\text{recency}} \cdot \text{Recency} + w_{\text{popularity}} \cdot \text{Popularity} + w_{\text{relevance}} \cdot \text{Relevance}$$
    Default weights: $w_{\text{recency}} = 0.4$, $w_{\text{popularity}} = 0.3$, $w_{\text{relevance}} = 0.3$.

* **Echo Chamber & Polarization Dynamics**:
  * *Definition*: The phenomenon where agents interact predominantly with like-minded peers, reinforcing existing beliefs and isolating themselves from dissenting viewpoints.
  * *MiroFish Context*: Controlled by `echo_chamber_strength` (default: 0.5) and `viral_threshold` (default: 10 interactions) in `simulation_config_generator.py`.

---

### Autonomous Reporting & Analytical Paradigms

* **ReAct Pattern (Reasoning + Acting)**:
  * *Definition*: An agentic prompting framework that interleaves reasoning traces ("Thought") with concrete execution steps ("Action" via Tool Calls) and feedback loops ("Observation").
  * *MiroFish Context*: Used by `ReportAgent` (`report_agent.py`). Instead of blindly summarizing data, the agent plans an outline, forms investigative hypotheses, calls retrieval tools to interrogate the simulation database, reflects on the findings, and synthesizes a cited report.

* **InsightForge**:
  * *Definition*: MiroFish's hybrid multi-subquery analytical retrieval tool.
  * *MiroFish Context*: Takes a complex predictive question, decomposes it into 3–5 targeted sub-questions, executes parallel vector and graph searches across active nodes and relationships, and synthesizes an evidence chain.

* **PanoramaSearch**:
  * *Definition*: A broad graph traversal tool that retrieves both currently active facts and superseded/invalidated historical facts.
  * *MiroFish Context*: Used by the ReportAgent to trace how opinion shifted over time (e.g., comparing agent sentiment at hour 1 versus hour 48).

* **Parametric Hallucination vs Grounded Deductive Analysis**:
  * *Definition*: Parametric hallucination occurs when an LLM invents facts from its training weights. Grounded analysis restricts output strictly to evidence observed in an external environment.
  * *MiroFish Context*: The ReportAgent prompt strictly mandates: *"All content must come from the simulated world. You are forbidden from using your own background knowledge. Every section must invoke tools at least 3 times and quote agent statements verbatim."*

* **Inter-Process Communication (IPC)**:
  * *Definition*: Mechanisms provided by an operating system allowing distinct processes to share data and coordinate execution.
  * *MiroFish Context*: Implemented in `simulation_ipc.py` via atomic file exchanges (`ipc_commands/` and `ipc_responses/`). This keeps the OASIS simulation process alive after the simulation finishes, allowing the user to conduct live 1-on-1 and batch cross-examinations with agents.

---

## 2. Foundational Paradigm: Why Swarm Simulation Outperforms Static LLM Prompting

### The Failure of Static Single-Prompt Prediction
When an executive asks ChatGPT: *"We are launching CCRM v1.6 with €1,500 lifetime licenses and AI boardroom recording. Will enterprise clients buy it?"*, the model generates a smooth, generalized essay based on average internet distributions. It suffers from:
1. **Consensus Bias**: Tendency to produce agreeable, middle-of-the-road predictions.
2. **Lack of Emergence**: It cannot simulate the nonlinear chain reactions that occur when a vocal security consultant tweets a GDPR critique, triggering panic among mid-market sales directors.
3. **Absence of Cognitive Asymmetry**: A single prompt cannot accurately maintain 50 conflicting agendas, budgets, and neuroses simultaneously.

### The Swarm Intelligence Mirror
MiroFish solves this by separating the world into individual autonomous nodes:
* The **Security Officer** cares exclusively about European privacy regulations and audio liabilities.
* The **Agency Owner** cares about eliminating monthly seat fees.
* The **SaaS Competitor** actively spreads FUD (Fear, Uncertainty, Doubt) to defend their subscription revenue.
* The **End-User Project Manager** cares about daily usability and task tracking.

When these heterogeneous agents interact within a simulated Twitter/Reddit topology, **the outcome is not decided by an LLM predicting the future; the outcome is discovered through emergent social competition**.

```
[ Seed Materials: Briefs, Policies, Drafts ]
                    │
                    ▼
   [ Automated Ontology & Knowledge Graph ]
                    │
                    ▼
       ┌────────────────────────┐
       │ Heterogeneous Agents   │  (50 - 500 Autonomous Personas)
       │ - Private agendas      │
       │ - Bounded rationality  │
       │ - Demographic traits   │
       └───────────┬────────────┘
                   │
                   ▼
       ┌────────────────────────┐
       │ Social Arena (OASIS)   │  (Parallel Twitter & Reddit)
       │ - RecSys Feeds         │
       │ - Quotes, Likes, Posts │
       │ - Circadian Cycles     │
       └───────────┬────────────┘
                   │
                   ▼
       [ Emergent Macro Trajectory ]  <── Observed & Analyzed by ReAct ReportAgent
```

---

## 3. System Architecture Overview & Data Flow

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                    FRONTEND LAYER                                      │
│  Vue 3 + Vite + Vue-Router + Vue-I18n + D3.js (Interactive Graph + Split Workbench)    │
│  Port: 3000                                                                            │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ HTTP REST / SSE Streams
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                     BACKEND API                                        │
│  Flask 3 + Python 3.11+                                                                │
│  - /api/graph       : File upload, ontology generation, graph building                 │
│  - /api/simulation  : Profile generation, config generation, runner control, IPC      │
│  - /api/report      : ReAct ReportAgent execution, agent chat, live logging            │
│  Port: 5001                                                                            │
└─────────────┬─────────────────────────────┬────────────────────────────┬───────────────┘
              │                             │                            │
              ▼                             ▼                            ▼
┌───────────────────────────┐ ┌───────────────────────────┐ ┌────────────────────────────┐
│   GRAPH / MEMORY ENGINE   │ │   SWARM ENGINE (OASIS)    │ │        LLM GATEWAY         │
│ - Zep Cloud / Graphiti    │ │ - camel-oasis / camel-ai  │ │ - OpenAI Python Client     │
│   (Bi-temporal graph)     │ │ - Subprocess Architecture │ │ - Model: Qwen-plus /       │
│ - LocalGraphStore Fallback│ │ - TwitterEnv & RedditEnv  │ │   GPT-4o-mini / DeepSeek   │
│   (uploads/graphs/*.json) │ │ - SQLite Trace Databases  │ │ - Configurable Base URL    │
└───────────────────────────┘ └───────────────────────────┘ └────────────────────────────┘
```

### End-to-End Execution Sequence
1. **User Action**: Uploads `reality-seed.md` and specifies simulation goal.
2. **Backend API**:
   - `FileParser` splits text into 500-token chunks with 50-token overlaps.
   - `OntologyGenerator` uses LLM to define domain-tailored entities and edges.
   - `GraphBuilderService` sends chunks to Zep Cloud (or `LocalGraphStore`).
3. **Environment Generation**:
   - `OasisProfileGenerator` queries the graph, generates rich demographic profiles (`twitter_profiles.csv`, `reddit_profiles.json`).
   - `SimulationConfigGenerator` calculates circadian time slots, agent activity levels, and external trigger events.
4. **Execution**:
   - `SimulationRunner` launches `run_parallel_simulation.py` as an isolated subprocess.
   - Agents read feeds, select actions, post, and comment. Traces write to SQLite.
   - `ZepGraphMemoryUpdater` streams action summaries back into the Zep Knowledge Graph.
5. **Deductive Analysis**:
   - Simulation completes. Environment enters IPC wait-state.
   - `ReportAgent` uses ReAct reasoning and `ZepToolsService` (`InsightForge`, `PanoramaSearch`) to draft a cited prediction report.
6. **Live Interrogation**:
   - User interviews specific agents via IPC (`commands/` -> `responses/`), receiving in-character answers based on the completed simulation history.

---

## 4. Step 1: Document Ingestion, Ontology Generation & Graph Construction

### Document Parsing Pipeline
* Located in `backend/app/utils/file_parser.py`.
* Supports `.pdf` (via `PyMuPDF`), `.md`, and `.txt`.
* Enforces character encoding detection using `charset-normalizer` and `chardet` to prevent encoding corruptions on Windows and Linux.
* Uses sliding window chunking:
  $$\text{Chunk Size} = 500 \text{ tokens}, \quad \text{Overlap} = 50 \text{ tokens}$$

### Ontology Design Rules (`ontology_generator.py`)
MiroFish implements a strict, domain-enforced system prompt:
1. **Social Actor Constraint**:
   * *Allowed Entities*: Living individuals (e.g., `Executive`, `SalesLead`, `Student`), legal entities (e.g., `Enterprise`, `RegulatoryBody`), media organizations, or representative collectives.
   * *Disallowed Entities*: Abstract concepts (e.g., *"Sentiment"*, *"Pricing Philosophy"*, *"Market Trend"*). Abstract concepts cannot open a social media account, write a tweet, or read a feed.
2. **Naming Conventions**:
   * Entities must use **PascalCase** (e.g., `SoftwareAgency`, `B2BClient`).
   * Edge/Relationships must use **SCREAMING_SNAKE_CASE** (e.g., `PURCHASES_FROM`, `REGULATES`, `CRITICIZES`).
3. **Attribute Normalization**:
   * Every entity must include typed attributes (`name`, `description`, `role`, `influence_level`).

```json
{
  "entity_types": [
    {
      "name": "B2BClient",
      "description": "Enterprise decision makers evaluating CRM procurement.",
      "attributes": [{"name": "budget_tier", "type": "text"}, {"name": "gdpr_sensitivity", "type": "text"}],
      "examples": ["Mid-Market Agency Director", "Corporate IT Buyer"]
    }
  ],
  "edge_types": [
    {
      "name": "EVALUATES_OFFERING",
      "description": "Client actively reviewing software specs.",
      "source_targets": [{"source": "B2BClient", "target": "SoftwareAgency"}]
    }
  ]
}
```

### Knowledge Graph Storage: Zep Cloud vs. LocalGraphStore
MiroFish supports two interchangeable graph backends:
1. **Zep Cloud (Graphiti Engine)**:
   * Enterprise-grade temporal graph database.
   * Extracts facts as triples with bi-temporal validity tracking.
   * Uses Reciprocal Rank Fusion (RRF) for hybrid vector + graph search.
2. **LocalGraphStore Fallback (`local_graph_service.py`)**:
   * Zero-cloud, local JSON graph database stored in `uploads/graphs/mirofish_local_<id>.json`.
   * Directly prompts the configured LLM with temperature `0.2` to extract nodes and edges into standard JSON.
   * Allows full offline development without requiring a Zep Cloud API key.

---

## 5. Step 2: Agent Persona Synthesis & Environmental Parameterization

### Profile Generation Engine (`oasis_profile_generator.py`)
To prevent the common multi-agent pitfall where all agents sound like standard assistant-style AI, MiroFish enriches graph nodes into multi-dimensional personas:

1. **Context Enrichment**:
   Before generating an agent, MiroFish executes a vector search in Zep for the entity's name, pulling all surrounding facts and historical connections into the generation prompt.
2. **Individual vs. Collective Generation**:
   * *Individual Entities* (e.g. `CEO`, `Journalist`): Generates a specific personal background, career history, and communication tone.
   * *Collective Entities* (e.g. `EnterpriseClients`, `RegulatoryAgency`): Generates a designated spokesperson or typical member representing the collective's consensus priorities.
3. **Psychological Grounding**:
   * **MBTI Typing**: Randomly distributes or contextually assigns one of the 16 MBTI personality types (e.g., `INTJ` analytical skeptic vs. `ENFP` enthusiastic early-adopter).
   * **Social Metrics**:
     * Twitter: `friend_count` (50–500), `follower_count` (100–10,000), `statuses_count` (100–5,000).
     * Reddit: `karma` (500–50,000).

```
┌────────────────────────────────────────────────────────┐
│                   OASIS Profile Fields                 │
├────────────────────────────────────────────────────────┤
│ user_id: 0                                             │
│ username: "marcus_enterprise_ops"                      │
│ name: "Marcus Thorne"                                  │
│ mbti: "ISTJ"                                           │
│ profession: "Chief Procurement Officer"                │
│ country: "Germany"                                     │
│ karma: 4120                                            │
│ user_char (Private System Prompt):                     │
│   "Strict, process-oriented enterprise buyer. Deeply   │
│    concerned with EU data sovereignty and audio GDPR   │
│    compliance. Skeptical of AI marketing claims."      │
│ description (Public Profile Bio):                      │
│   "Enterprise IT & Procurement | Berlin | Data Privacy"│
└────────────────────────────────────────────────────────┘
```

### Simulation Config Automation (`simulation_config_generator.py`)
MiroFish models real human circadian rhythms using the **China/European Diurnal Model**:

```python
CHINA_TIMEZONE_CONFIG = {
    "dead_hours": [0, 1, 2, 3, 4, 5],      # Activity multiplier: 0.05
    "morning_hours": [6, 7, 8],             # Activity multiplier: 0.4
    "work_hours": [9, 10, 11, 12, ..., 18], # Activity multiplier: 0.7
    "peak_hours": [19, 20, 21, 22],         # Activity multiplier: 1.5
    "night_hours": [23],                    # Activity multiplier: 0.5
}
```

* **Dynamic Hourly Agent Activation**:
  $$\text{Active Agents}(t) = \text{Base Agents} \times \text{Multiplier}(t)$$
  During simulated late night (02:00), almost no agents post or check feeds. During peak evening hours (20:00), agent activity surges by 150%, triggering viral cascades.
* **Agent Behavior Parameters**:
  * `activity_level`: Probability (0.0–1.0) of taking an action when activated.
  * `sentiment_bias`: Baseline emotional tone (-1.0 negative to +1.0 positive).
  * `stance`: Initial posture toward the topic (`supportive`, `opposing`, `neutral`, `observer`).
  * `response_delay_min` / `response_delay_max`: Simulated minutes before reacting to an observed post.

---

## 6. Step 3: Swarm Simulation Execution (CAMEL-AI OASIS Engine)

### Subprocess Orchestration (`simulation_runner.py`)
The simulation does not run inside the Flask web server thread. It is spawned as a detached asynchronous subprocess running `run_parallel_simulation.py`:
* Keeps memory isolated.
* Protects against Python Global Interpreter Lock (GIL) contention.
* Allows safe kill signals (`SIGTERM`, `SIGINT`) via `atexit` cleanup hooks.

### Dual-Platform Social Architecture
MiroFish simulates two distinct social topographies simultaneously:

| Feature | Twitter Environment (`oasis.TwitterEnv`) | Reddit Environment (`oasis.RedditEnv`) |
| :--- | :--- | :--- |
| **Network Structure** | Asymmetric Follow Graph (Broadcast) | Threaded Subreddit Hierarchy |
| **Communication Style** | Short, high-velocity posts & quotes | In-depth hierarchical discussion trees |
| **Viral Mechanism** | Reposts (`REPOST`) & Quotes (`QUOTE_POST`) | Upvotes (`LIKE_POST`), Downvotes, Trending |
| **Audience Scope** | Global timeline + Followers | Community-specific (Subreddits) |

### Concurrency & Rate Limiting
* In each round, hundreds of agents query LLMs concurrently.
* MiroFish wraps OASIS execution in an `asyncio.Semaphore(30)`:
  * Maximum 30 concurrent outbound LLM requests.
  * Prevents API rate-limit errors (HTTP 429) on commercial gateways (OpenAI, DashScope, DeepSeek).

### Real-Time SQLite Trace Schema
OASIS logs every social action into `twitter_simulation.db` and `reddit_simulation.db`:
```sql
CREATE TABLE trace (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT,           -- 'CREATE_POST', 'LIKE_POST', 'QUOTE_POST', etc.
    info TEXT,             -- JSON: {content, post_id, author_id, response}
    created_at TIMESTAMP
);
```

### The Closed-Loop Memory Updater (`zep_graph_memory_updater.py`)
MiroFish introduces a breakthrough architectural pattern: **the simulation updates its own foundational knowledge graph in real time**.

```
[ Agent A executes Action ]  (e.g., Agent #4 quotes Agent #1 with a privacy critique)
            │
            ▼
[ to_episode_text() Translator ]
  Transforms action into formal natural language statement:
  "[2026-09-10 14:00] [twitter round 4] Marcus Thorne: Quoted CCRM post,
   stating that recording client meetings violates GDPR Article 6."
            │
            ▼
[ Async Queue & Batch Ingestion ]
  Batches statements every round
            │
            ▼
[ Zep Graphiti Dynamic Graph ]
  - Updates relation between Marcus Thorne and CCRM
  - Marks prior positive adoption relationship as EXPIRED
  - Creates new edge: Marcus_Thorne --[REJECTS_DUE_TO_GDPR]--> CCRM
```

This guarantees that when the simulation finishes, the knowledge graph contains the complete historical evolution of the world, not just the starting conditions.

---

## 7. Step 4: Analytical ReAct Report Agent & Tool Suite

### The God's-Eye Analyst (`report_agent.py`)
When the simulation ends, the **ReportAgent** activates. It does not look at code; it looks at the simulated world from a "God's-Eye View".

### Two-Phase Synthesis Protocol
1. **Phase 1: Master Outline Planning**:
   * Evaluates the user's initial prediction requirement against the scale of the world (number of active agents, total actions, stance distributions).
   * Generates a structured JSON table of contents (2 to 5 sections maximum, keeping focus sharp).
2. **Phase 2: Section-by-Section ReAct Generation**:
   * For each section, the agent enters a multi-turn ReAct reasoning loop (configured via `REPORT_AGENT_MAX_TOOL_CALLS = 5` and reflection cycles).

```
   ┌────────────────────────────────────────────────────────────┐
   │                   ReAct Execution Loop                     │
   │                                                            │
   │   [ Thought ] : "I need to determine if enterprise buyers  │
   │                 rejected the €1,500 pricing or the audio   │
   │                 recording feature."                        │
   │        │                                                   │
   │        ▼                                                   │
   │   [ Action ]  : Call InsightForge(query="pricing vs audio")│
   │        │                                                   │
   │        ▼                                                   │
   │   [ Observe ] : Tool returns 14 facts: 12 cite GDPR, only  │
   │                 2 cite pricing.                            │
   │        │                                                   │
   │        ▼                                                   │
   │   [ Reflect ] : "Pricing is a non-issue. The critical      │
   │                 failure point is audio compliance."        │
   │        │                                                   │
   │        ▼                                                   │
   │   [ Output ]  : Draft section citing exact agent quotes.   │
   └────────────────────────────────────────────────────────────┘
```

### Specialized Analytical Toolset (`zep_tools.py`)

1. **`InsightForge` (Deep Deductive Retrieval)**:
   * Automatically breaks the user's inquiry into multi-dimensional sub-queries.
   * Executes hybrid vector and relation-chain searches.
   * Returns:
     * `semantic_facts`: Extracted verbatim facts.
     * `entity_insights`: Node summaries and roles.
     * `relationship_chains`: Multi-hop connections (e.g. `Client -> Fears -> Penalty -> From -> Regulator`).
2. **`PanoramaSearch` (Broad Temporal Retrieval)**:
   * Traverses both active facts and expired/historical facts.
   * Enables the agent to write sentences like: *"While clients initially expressed enthusiasm for AI summaries in Round 1, sentiment collapsed by Round 6 following regulatory scrutiny."*
3. **`QuickSearch`**:
   * Lightweight, rapid semantic lookup for specific fact verifications.
4. **`InterviewAgents`**:
   * Enables the ReportAgent to dynamically question live agents during report drafting to gather supporting quotes.

### Live Streaming & Audit Logs
Every thought, tool parameter, tool observation, and reflection is streamed to the frontend via Server-Sent Events (SSE) and appended to:
`uploads/reports/<report_id>/agent_log.jsonl`

---

## 8. Step 5: Post-Simulation Live Sandbox & Inter-Process Communication (IPC)

### Non-Blocking File-Based IPC Protocol (`simulation_ipc.py`)
Traditional simulation tools exit once the final round finishes. MiroFish intentionally keeps the Python subprocess alive in a background command-waiting loop.

```
       FLASK API PROCESS                           OASIS SUBPROCESS
┌───────────────────────────────┐               ┌───────────────────────────────┐
│ User clicks "Interview Agent" │               │ OASIS Simulation Event Loop   │
│               │               │               │ (Waiting in idle poll mode)   │
│               ▼               │               │               │               │
│ Writes command JSON to:       │               │ Polls directory every 500ms   │
│ ipc_commands/<cmd_id>.json    ├──────────────►│ Reads command file            │
│               │               │  File System  │               │               │
│               │               │               │ Executes ManualAction:        │
│               │               │               │ ActionType.INTERVIEW          │
│               │               │               │               │               │
│ Polls for response file...    │               │ Writes result to:             │
│ Reads response:               │◄──────────────┤ ipc_responses/<cmd_id>.json   │
│ ipc_responses/<cmd_id>.json   │               │ Deletes command file          │
│               │               │               └───────────────────────────────┘
│               ▼               │
│ Sends answer to Frontend UI   │
└───────────────────────────────┘
```

#### Why File-Based IPC?
* Works flawlessly across operating systems (macOS, Windows, Linux, Docker containers) without socket permission issues.
* Immune to pipe buffer overflow deadlocks when large trace payloads are exchanged.
* Survives transient Flask server reloads without killing the active simulation environment.

### Supported IPC Commands
* `interview`: Interrogates a single agent with a custom prompt.
* `batch_interview`: Sends customized or identical interview prompts to dozens of agents across both Twitter and Reddit simultaneously.
* `close_env`: Safely shuts down SQLite connections, flushes logs, and terminates the subprocess.

### The Agent Cross-Examination Experience
In Step 5 (`Step5Interaction.vue`), the user can:
1. Open the **Report Agent Chat**: Ask high-level analytical questions (*"What was the single biggest objection raised by enterprise buyers?"*).
2. Open the **Agent Directory**: Pick any simulated persona (e.g. *Sarah Jenkins, Enterprise Buyer*).
3. Send a direct question: *"Sarah, why did you refuse to renew your license?"*
4. Receive a live, first-person response conditioned on Sarah's internal persona, her memory of the simulation, and the tweets she read during the run.

---

## 9. Frontend Visualization: D3 Force-Directed Graph & Split Workbench

### Architectural Structure
* Built with **Vue 3 (Composition API)** and **Vite**.
* Located in `frontend/src/`.
* Divided into a flexible 3-way layout:
  * `graph`: Full-screen knowledge graph view.
  * `split`: 50/50 split-screen (Graph on left, workbench on right).
  * `workbench`: Focused workspace for data inspection and chat.

### D3.js Force-Directed Graph Implementation (`GraphPanel.vue`)
* Renders SVG elements using a physics simulation:
  * `d3.forceSimulation()`
  * `d3.forceLink()`: Spring forces along edges.
  * `d3.forceManyBody()`: Repulsion forces preventing node overlap.
  * `d3.forceCenter()`: Gravitational attraction to panel center.
* **Visual Semantics**:
  * Node colors indicate entity types (e.g., Blue = Clients, Red = Competitors, Orange = Regulators).
  * Node radius scales with relative influence or degree centrality.
  * Edge labels display relationship types (`CRITICIZES`, `LICENSES`).
  * Live pulsing animation activates when the simulation updates the graph in real time.

---

## 10. Mathematical, Behavioral & Algorithmic Formulations

### Diurnal Activity Multiplier
The probability $P_{\text{active}}(i, t)$ that agent $i$ takes an action at simulated hour $t \in [0, 23]$ is governed by:

$$P_{\text{active}}(i, t) = \alpha_i \cdot M(t) \cdot \mathbb{I}(t \in H_i)$$

Where:
* $\alpha_i \in [0.0, 1.0]$ is the agent's baseline activity level (`activity_level`).
* $M(t)$ is the circadian multiplier from `CHINA_TIMEZONE_CONFIG`:
  $$M(t) = \begin{cases} 
  0.05 & \text{if } t \in [0, 5] \text{ (Dead hours)} \\
  0.40 & \text{if } t \in [6, 8] \text{ (Morning hours)} \\
  0.70 & \text{if } t \in [9, 18] \text{ (Work hours)} \\
  1.50 & \text{if } t \in [19, 22] \text{ (Peak evening hours)} \\
  0.50 & \text{if } t = 23 \text{ (Late night)}
  \end{cases}$$
* $H_i \subset [0, 23]$ is the agent's active hour window (`active_hours`).
* $\mathbb{I}(\cdot)$ is the indicator function ($1$ if true, $0$ if false).

### OASIS Recommendation Algorithm Scoring
When agent $i$ refreshes their timeline, candidate posts $p$ are ranked by score $S(p)$:

$$S(p) = w_r \cdot R(p) + w_p \cdot P(p) + w_s \cdot \text{Sim}(E_i, E_p)$$

Where:
* $R(p) = \frac{1}{\Delta t + 1}$ represents time decay / recency ($w_r = 0.4$).
* $P(p) = \log(1 + \text{likes} + 2 \cdot \text{quotes} + 3 \cdot \text{reposts})$ represents popularity ($w_p = 0.3$).
* $\text{Sim}(E_i, E_p)$ represents cosine semantic similarity between agent $i$'s interest embeddings and the post embedding ($w_s = 0.3$).

### Bi-temporal Validity Invalidation
In Zep/Graphiti, a fact $F = (S, R, O)$ is valid during the interval $[t_{\text{valid}}, t_{\text{invalid}})$.
When a contradiction or stance transition occurs at simulation time $t_{\text{event}}$:
1. The prior edge $F_{\text{old}}$ is updated:
   $$t_{\text{invalid}}(F_{\text{old}}) \leftarrow t_{\text{event}}, \quad t_{\text{expired}}(F_{\text{old}}) \leftarrow t_{\text{event}}$$
2. A new edge $F_{\text{new}}$ is instantiated:
   $$t_{\text{valid}}(F_{\text{new}}) \leftarrow t_{\text{event}}, \quad t_{\text{invalid}}(F_{\text{new}}) \leftarrow \infty$$

---

## 11. Concrete Case Study: The CCRM v1.6 Product Launch Scenario

Found in the test seed file [`reality-seed.md`](file:///Users/erik/Documents/vibe%20coding/mirofish/reality-seed.md), this real-world scenario demonstrates how MiroFish models a complex product launch.

### 1. The Seed Context
* **Product**: CCRM version 1.6.
* **Key Features**:
  1. AI Boardroom (Meeting audio recording + auto-transcription).
  2. €1,500/year self-hosted lifetime licensing with optional updates.
  3. Automated solvency checks via Slovak public registries (IČO).
  4. No-code custom visual dashboards.
* **Core Tensions**:
  * *Tension A (Data Privacy)*: Recording executive client meetings triggers GDPR compliance fears in B2B Europe.
  * *Tension B (The Update Trap)*: Because the software remains functional without renewing, buyers may treat it as a one-time purchase, threatening recurring revenue.

### 2. Extracted Entities & Personas
* **Enterprise Decision Maker**: High budget, extremely sensitive to GDPR liability, reports to corporate legal.
* **Agency Owner**: Low budget, hates monthly Salesforce/Pipedrive seat fees, eager for self-hosted lifetime software.
* **Traditional SaaS Competitor**: High-margin subscription provider, launches public relations campaigns warning of security risks in self-hosted CRMs.
* **Regulatory Compliance Auditor**: Public sector actor monitoring European privacy infractions.

### 3. Emergent Simulation Dynamics Observed
* **Rounds 1–3**: Agency owners tweet excitedly about the €1,500 license, praising the death of per-user seat pricing. Initial sentiment is overwhelmingly positive.
* **Rounds 4–7**: Competitor accounts quote the "AI Boardroom" audio recording feature, asking: *"Where is the audio processed? Is it sent to US cloud APIs?"*
* **Rounds 8–12**: Enterprise buyers notice the compliance debate. On Reddit, an enterprise buyer posts a thread: *"Why our legal team blocked CCRM v1.6 adoption due to audio recording liability"*. The thread hits the viral threshold.
* **Rounds 13–20**: Sentiment polarizes. Agency owners continue to buy, but enterprise adoption drops to zero unless an on-premise transcription model is promised.

### 4. ReportAgent Output
The ReportAgent drafts a 3-section report:
1. **Executive Summary**: The €1,500 self-hosted price is an immense competitive advantage that captures the agency market.
2. **Critical Vulnerability**: The AI Boardroom audio feature acts as a poison pill for enterprise deals due to unaddressed GDPR messaging.
3. **Strategic Recommendations**: Decouple the AI Boardroom from the core package; offer local offline whisper transcription to unlock enterprise procurement.

---

## 12. System Limitations, Failure Modes & Engineering Trade-offs

### 1. Token Economics & LLM Gateway Costs
* Running 50 agents across 30 rounds with Twitter and Reddit parallel environments generates:
  $$\text{Total Calls} \approx 50 \text{ agents} \times 30 \text{ rounds} \times 2 \text{ platforms} \times 1.2 \text{ (overhead)} \approx 3,600 \text{ LLM calls}$$
* *Mitigation*: MiroFish recommends low-cost, high-speed models such as Alibaba Qwen-plus (`dashscope`), DeepSeek V3, or OpenAI `gpt-4o-mini`.

### 2. Process Cleanup on Unix/Windows
* Subprocesses running OASIS environments can become orphaned if Flask is forcibly killed (`kill -9`).
* *Mitigation*: MiroFish implements signal handlers (`SIGINT`, `SIGTERM`) and `atexit` registrations in `simulation_runner.py` to recursively terminate child process groups.

### 3. Rate-Limit Bottlenecks
* Burst requests at round boundaries can overwhelm LLM API quotas.
* *Mitigation*: Enforced concurrency caps via `asyncio.Semaphore(30)` in `run_parallel_simulation.py`.

### 4. Dependency on Zep Cloud
* High-volume graph updates require a paid Zep Cloud tier or a properly provisioned self-hosted Zep + `pgvector` container.
* *Mitigation*: MiroFish maintains the `LocalGraphStore` module for zero-cloud local testing and evaluation.

---

## Quick Reference: Key File Map

| Path | Purpose |
| :--- | :--- |
| [`backend/app/services/ontology_generator.py`](file:///Users/erik/Documents/vibe%20coding/mirofish/backend/app/services/ontology_generator.py) | LLM ontology synthesis & social actor extraction |
| [`backend/app/services/graph_builder.py`](file:///Users/erik/Documents/vibe%20coding/mirofish/backend/app/services/graph_builder.py) | Zep Standalone Knowledge Graph batch ingestion |
| [`backend/app/services/oasis_profile_generator.py`](file:///Users/erik/Documents/vibe%20coding/mirofish/backend/app/services/oasis_profile_generator.py) | Node-to-Agent profile conversion (Twitter CSV & Reddit JSON) |
| [`backend/app/services/simulation_config_generator.py`](file:///Users/erik/Documents/vibe%20coding/mirofish/backend/app/services/simulation_config_generator.py) | Circadian rhythms, activity levels, and event schedules |
| [`backend/app/services/simulation_runner.py`](file:///Users/erik/Documents/vibe%20coding/mirofish/backend/app/services/simulation_runner.py) | Subprocess supervisor and process lifecycle controller |
| [`backend/app/services/simulation_ipc.py`](file:///Users/erik/Documents/vibe%20coding/mirofish/backend/app/services/simulation_ipc.py) | File-based command/response queue for live interviews |
| [`backend/app/services/zep_graph_memory_updater.py`](file:///Users/erik/Documents/vibe%20coding/mirofish/backend/app/services/zep_graph_memory_updater.py) | Real-time action-to-episode stream updating the graph |
| [`backend/app/services/report_agent.py`](file:///Users/erik/Documents/vibe%20coding/mirofish/backend/app/services/report_agent.py) | ReAct predictive reporting agent with reflection loops |
| [`backend/app/services/zep_tools.py`](file:///Users/erik/Documents/vibe%20coding/mirofish/backend/app/services/zep_tools.py) | InsightForge, PanoramaSearch, and QuickSearch retrieval tools |
| [`frontend/src/components/GraphPanel.vue`](file:///Users/erik/Documents/vibe%20coding/mirofish/frontend/src/components/GraphPanel.vue) | D3.js interactive force-directed graph visualization |
| [`frontend/src/components/Step5Interaction.vue`](file:///Users/erik/Documents/vibe%20coding/mirofish/frontend/src/components/Step5Interaction.vue) | Split view for report inspection & live agent cross-examination |
