# 07 — Telemetry Pipeline

## Philosophy

> "If it happened, there's a telemetry event for it."

Every action in the system — from the user clicking "Ping" to the last result arriving — emits structured telemetry. This isn't bolted on; the telemetry pipeline IS the backbone of the app. The same events that power the animated globe also populate dashboards, alerts, and historical analytics.

## Pipeline Architecture

```
┌────────────────┐    ┌────────────────┐    ┌──────────────────┐
│  Ping Agents   │    │  Orchestrator  │    │  Frontend        │
│  (per region)  │    │  (central)     │    │  (browser)       │
└───────┬────────┘    └───────┬────────┘    └───────┬──────────┘
        │                     │                     │
        │ trackEvent()        │ trackEvent()        │ trackEvent()
        │ trackMetric()       │ trackMetric()       │ (App Insights JS SDK)
        ▼                     ▼                     ▼
┌──────────────────────────────────────────────────────────────┐
│                   Application Insights                        │
│                                                               │
│  Custom Events:  PingMeasurement, PingSessionCompleted,      │
│                  AgentHealthCheck, OrchestratorFanOut          │
│  Custom Metrics: latencyMs, jitterMs, sampleCount            │
│  Dependencies:   HTTP calls between orchestrator ↔ agents    │
│  Exceptions:     Timeouts, connection failures                │
│  Page Views:     Globe loads, result page views               │
│                                                               │
│  ┌─ Continuous Export / Diagnostic Settings ──────────────┐   │
│  │  Raw events → Event Hub                                │   │
│  └────────────────────────┬───────────────────────────────┘   │
└───────────────────────────┼───────────────────────────────────┘
                            │
                            ▼
              ┌──────────────────────────┐
              │       Event Hub          │
              │  Namespace: evhns-arp    │
              │  Hub: ping-events        │
              │  Partitions: 4           │
              │  Retention: 7 days       │
              └────────────┬─────────────┘
                           │
              ┌────────────┼─────────────────┐
              ▼            ▼                  ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │ Stream       │ │ Azure Func   │ │ (Future)     │
    │ Analytics    │ │ Aggregator   │ │ Databricks / │
    │ (real-time)  │ │ (batch, 5m)  │ │ Fabric       │
    └──────┬───────┘ └──────┬───────┘ └──────────────┘
           │                │
           ▼                ▼
    ┌──────────────────────────┐
    │       Cosmos DB          │
    │  Container: aggregates   │
    │  (rolling avgs, daily)   │
    └──────────────────────────┘
           │
           ▼
    ┌──────────────────────────┐
    │  Dashboards              │
    │  - App Insights Workbook │
    │  - Grafana (optional)    │
    │  - In-app analytics page │
    └──────────────────────────┘
```

## Telemetry Events — Complete Catalog

### From Ping Agents

| Event Name | When | Key Properties | Key Metrics |
|---|---|---|---|
| `PingMeasurement` | Each source→target measurement done | sessionId, source, target, protocol, status, correlationId | latencyAvg, latencyP50, latencyP95, jitter, sampleCount |
| `AgentHealthCheck` | Every 60s (timer trigger) | regionId, agentVersion | uptimeMs, memoryMb |
| `PingTargetUnreachable` | Target agent didn't respond | source, target, errorType | timeoutMs |

### From Orchestrator

| Event Name | When | Key Properties | Key Metrics |
|---|---|---|---|
| `PingSessionStarted` | Orchestration begins | sessionId, mode, sourceRegion, clientIpHash | targetCount |
| `PingSessionCompleted` | Orchestration ends | sessionId, mode, sourceRegion | durationMs, regionsOk, regionsFailed, globalAvgMs |
| `OrchestratorFanOut` | HTTP calls dispatched | sessionId | fanOutCount, fanOutDurationMs |
| `SignalRMessageSent` | Each push to client | sessionId, messageType | - |

### From Frontend (Browser)

| Event Name | When | Key Properties | Key Metrics |
|---|---|---|---|
| `GlobeLoaded` | 3D globe finishes rendering | browserUA, screenRes | loadTimeMs, fps |
| `PingRequested` | User clicks Ping | mode, sourceRegion | - |
| `ResultViewed` | User opens detail panel | source, target | - |
| `ResultShared` | User clicks Share | sessionId | - |
| `AnimationPerformance` | Every 5s during animation | - | fps, arcCount, droppedFrames |

## Correlation

Every operation is linked through a **correlation chain**:

```
sessionId (user-initiated test)
  └─ orchestrationId (Durable Functions instance)
       └─ correlationId (per ping measurement)
            └─ Application Insights operation_Id (distributed trace)
```

This means you can:
- Start from a user session → see every ping that fired.
- Start from a slow result → trace back to the orchestrator call → see the agent's internal timing.
- Use App Insights **Application Map** to visualize the distributed call graph.

## Custom Metrics (Application Insights)

Pre-aggregated metrics emitted every minute:

| Metric Name | Dimensions | Unit |
|---|---|---|
| `ping.latency.avg` | source, target | ms |
| `ping.latency.p95` | source, target | ms |
| `ping.jitter` | source, target | ms |
| `ping.success.rate` | source, target | % |
| `ping.session.duration` | mode | ms |
| `globe.fps` | - | frames/sec |

## Stream Analytics Queries

### Rolling 5-minute average per region pair

```sql
SELECT
    source,
    target,
    System.Timestamp() AS windowEnd,
    AVG(latencyAvgMs) AS avgLatency,
    MIN(latencyAvgMs) AS minLatency,
    MAX(latencyAvgMs) AS maxLatency,
    COUNT(*) AS sampleCount
INTO [cosmos-aggregates]
FROM [eventhub-ping-events] TIMESTAMP BY eventTime
WHERE eventName = 'PingMeasurement'
GROUP BY
    source, target,
    TumblingWindow(minute, 5)
```

### Anomaly detection — sudden latency spike

```sql
SELECT
    source, target,
    AVG(latencyAvgMs) AS currentAvg,
    LAG(AVG(latencyAvgMs), 1) OVER (
        PARTITION BY source, target
        LIMIT DURATION(minute, 10)
    ) AS previousAvg
INTO [alerts-output]
FROM [eventhub-ping-events] TIMESTAMP BY eventTime
WHERE eventName = 'PingMeasurement'
GROUP BY source, target, TumblingWindow(minute, 5)
HAVING currentAvg > previousAvg * 1.5
```

## Application Insights Workbook — "Mission Control"

A custom workbook with these tabs:

### Tab 1: Live Overview
- **World map** with color-coded regions (avg latency as marker color).
- **Real-time session count** (active tests right now).
- **Top 5 fastest / slowest pairs** (last hour).

### Tab 2: Region Deep Dive
- Select a region → see latency to all other regions as bar chart.
- Trend line over 24h / 7d / 30d.
- Jitter distribution histogram.

### Tab 3: Health
- Agent health status grid (25 regions × last 24 checks).
- Function execution times (p50/p95).
- Error rate by region.
- SignalR connection count over time.

### Tab 4: User Analytics
- Tests per day (bar chart).
- Most popular source regions.
- Browser/device breakdown.
- Average globe FPS.

## KQL Queries (App Insights — Useful Examples)

### Latency heatmap data
```kql
customEvents
| where name == "PingMeasurement"
| where timestamp > ago(24h)
| summarize avgLatency = avg(todouble(customMeasurements.latencyAvgMs))
    by source = tostring(customDimensions.source),
       target = tostring(customDimensions.target)
| order by source asc, target asc
```

### Slowest pairs in the last hour
```kql
customEvents
| where name == "PingMeasurement"
| where timestamp > ago(1h)
| summarize avgMs = avg(todouble(customMeasurements.latencyAvgMs))
    by source = tostring(customDimensions.source),
       target = tostring(customDimensions.target)
| top 10 by avgMs desc
```

### Session completion rate
```kql
customEvents
| where name in ("PingSessionStarted", "PingSessionCompleted")
| where timestamp > ago(24h)
| summarize count() by name, bin(timestamp, 1h)
| render timechart
```

## Alerting Rules

| Alert | KQL / Metric Condition | Severity | Action Group |
|---|---|---|---|
| Agent down | `AgentHealthCheck` missing for region > 5 min | Sev 1 | PagerDuty |
| Global latency spike | `ping.latency.avg` (all pairs) > 200ms for 10 min | Sev 2 | Teams |
| High error rate | `PingTargetUnreachable` > 10 events in 5 min | Sev 2 | Teams |
| Slow orchestrator | `ping.session.duration` p95 > 20s for 15 min | Sev 3 | Email |
| Low FPS | `globe.fps` avg < 30 for users for 1 hour | Sev 4 | Email |
