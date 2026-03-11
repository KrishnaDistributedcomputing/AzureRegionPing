# 02 — Architecture

## Philosophy

Every ping is a **telemetry event**. The system is designed so that latency measurement, visualization data, and operational observability all flow through a single pipeline. The architecture is event-driven, globally distributed, and optimized for real-time streaming to the browser.

## High-Level Design

```
                         ┌──────────────────────────────┐
                         │       Browser Client          │
                         │  React + Three.js/Globe.gl    │
                         │  ◄──── SignalR ────►          │
                         └────────────┬─────────────────┘
                                      │ HTTPS + WebSocket
                                      ▼
                         ┌──────────────────────────────┐
                         │   Orchestrator Function       │
                         │   (Central Region)            │
                         │   - Receives ping requests    │
                         │   - Fans out to region agents │
                         │   - Streams results back      │
                         └────────────┬─────────────────┘
                                      │ Service Bus / HTTP fan-out
                    ┌─────────────────┼─────────────────────┐
                    ▼                 ▼                      ▼
           ┌──────────────┐  ┌──────────────┐      ┌──────────────┐
           │ Ping Agent   │  │ Ping Agent   │ ...  │ Ping Agent   │
           │ East US      │  │ West Europe  │      │ SE Asia      │
           │ (Azure Func) │  │ (Azure Func) │      │ (Azure Func) │
           └──────┬───────┘  └──────┬───────┘      └──────┬───────┘
                  │                  │                      │
                  │  TCP/ICMP/HTTP ping to all other agents │
                  │                  │                      │
                  ▼                  ▼                      ▼
           ┌──────────────────────────────────────────────────────┐
           │              Telemetry Pipeline                       │
           │  App Insights ──► Event Hub ──► Stream Analytics     │
           │                                  │                   │
           │                          ┌───────┴────────┐          │
           │                          ▼                ▼          │
           │                    Cosmos DB        SignalR Service   │
           │                   (hot store)      (push to browser) │
           └──────────────────────────────────────────────────────┘
```

## Components

### 1. Frontend — The Globe

| Aspect | Detail |
|---|---|
| **Framework** | React 18 + TypeScript |
| **3D Globe** | `globe.gl` (Three.js wrapper) or `react-three-fiber` + custom globe |
| **Bundler** | Vite |
| **Real-time** | `@microsoft/signalr` client |
| **State** | Zustand (lightweight, perfect for streaming updates) |
| **Hosting** | Azure Static Web Apps |

The globe renders Azure regions as nodes. When a ping fires, an animated arc + particle travels the geodesic path between source→target. Color encodes latency (green < 50ms, yellow < 150ms, red > 150ms). A "sonic boom" ripple effect plays when the ping arrives.

### 2. Orchestrator Function (Central Hub)

- **Tech:** Azure Functions (Node.js, Durable Functions for fan-out/fan-in).
- **Region:** Single deployment (e.g., East US 2) — coordinates all pings.
- **Responsibilities:**
  - Accept ping requests from the browser (single-source or mesh mode).
  - Fan out HTTP calls to **Ping Agent Functions** in each target region.
  - Collect results, push to SignalR for real-time streaming.
  - Write structured telemetry to Application Insights + Event Hub.

**Why Durable Functions?** The fan-out/fan-in pattern is native. The orchestrator fires N parallel activities and streams each result to SignalR as it completes — no waiting for all to finish.

### 3. Ping Agent Functions (Per-Region)

- **Tech:** Azure Functions (Node.js), deployed to **every target region**.
- **Responsibilities:**
  - Receive "ping this list of targets" from the orchestrator.
  - Perform TCP connect / HTTP HEAD to each target agent's health endpoint.
  - Measure latency with `process.hrtime.bigint()` (nanosecond precision).
  - Collect multiple samples (default: 5) and compute min/avg/max/p50/p95/jitter.
  - Return structured `PingResult` with full telemetry.
  - Emit custom App Insights events with correlation IDs.

### 4. Azure SignalR Service

- Serverless mode — no persistent connections on the server side.
- Orchestrator pushes messages to specific client groups.
- Message types:
  - `ping-started` — animation trigger (arc begins).
  - `ping-result` — single region result (arc arrives, node updates).
  - `ping-complete` — all done, final summary.

### 5. Telemetry Pipeline

```
Ping Agent ──► Application Insights (custom events + metrics)
                    │
                    ▼
              Event Hub (raw events stream)
                    │
                    ▼
              Stream Analytics (aggregation: rolling avg, percentiles)
                    │
               ┌────┴────┐
               ▼         ▼
          Cosmos DB    Power BI / Grafana
         (hot store)   (dashboards)
```

See [07-telemetry.md](07-telemetry.md) for full pipeline design.

### 6. Data Store — Cosmos DB

- **API:** NoSQL (Core SQL).
- **Partitioning:** `sourceRegion` as partition key.
- **TTL:** 30 days for raw results, aggregated summaries kept indefinitely.
- **Use cases:** Historical queries, trend analysis, shareable result pages.

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Ping method | HTTP HEAD to agent endpoints | Works through firewalls; no ICMP needed in Functions |
| Orchestration | Durable Functions fan-out | Native parallel execution + streaming results |
| Real-time push | Azure SignalR Service | Serverless, scales automatically, cheap |
| Globe rendering | globe.gl / Three.js | GPU-accelerated, great arc animations built in |
| Per-region deployment | Azure Functions per region | Cheapest way to get compute in 25+ regions |
| Telemetry backbone | Application Insights + Event Hub | Unified: operational monitoring + analytics in one |
| State management | Zustand | Minimal boilerplate, great for streaming updates |

## Data Flow — Single Ping

```
1. User clicks "Ping All from East US"
2. Browser ──POST──► Orchestrator Function
3. Orchestrator starts Durable orchestration
4. Orchestrator pushes "ping-started" via SignalR ──► Browser animates arcs departing
5. Orchestrator fans out 24 HTTP calls to Ping Agents in parallel
6. Each Ping Agent:
   a. HTTP HEAD to all other agents (5 samples each)
   b. Computes stats
   c. Emits App Insights custom event
   d. Returns PingResult to Orchestrator
7. As each result arrives:
   a. Orchestrator pushes "ping-result" via SignalR ──► Browser lands the arc
   b. Orchestrator writes to Cosmos DB
8. All done → "ping-complete" via SignalR ──► Browser shows summary
```

## Data Flow — Mesh Mode

Same as above, but step 4-7 fires from **every** region simultaneously. The orchestrator manages N parallel sub-orchestrations. The globe lights up like a fireworks show.
