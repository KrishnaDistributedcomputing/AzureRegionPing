# 04 — Data Model & Storage

## Storage: Cosmos DB (NoSQL API)

### Why Cosmos DB?

- **Global distribution** — read replicas in multiple regions for fast result retrieval.
- **Low-latency reads** — single-digit ms for result page loads.
- **TTL support** — auto-expire raw data, keep summaries.
- **Rich queries** — SQL-like queries for trend analysis.
- **Change feed** — powers the real-time telemetry pipeline.

---

## Containers

### 1. `sessions`

One document per ping test session.

**Partition Key:** `id` (sessionId)

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "mode": "single",
  "sourceRegion": "eastus",
  "status": "completed",
  "startedAt": "2026-03-11T12:00:00Z",
  "completedAt": "2026-03-11T12:00:08Z",
  "durationMs": 8234,
  "clientIpHash": "sha256-abc...",
  "samples": 5,
  "protocol": "http",
  "summary": {
    "regionsTotal": 24,
    "regionsOk": 24,
    "regionsFailed": 0,
    "fastestPair": { "source": "eastus", "target": "eastus2", "avgMs": 1.2 },
    "slowestPair": { "source": "eastus", "target": "australiaeast", "avgMs": 198.4 },
    "globalAvgMs": 92.3
  },
  "ttl": 2592000
}
```

### 2. `results`

One document per source→target measurement in a session.

**Partition Key:** `sessionId`

```json
{
  "id": "a1b2c3d4-..._eastus_westeurope",
  "sessionId": "a1b2c3d4-...",
  "source": "eastus",
  "target": "westeurope",
  "sourceCoords": { "lat": 37.3719, "lng": -79.8164 },
  "targetCoords": { "lat": 52.3667, "lng": 4.9000 },
  "latency": {
    "min": 85.2,
    "avg": 88.7,
    "max": 92.1,
    "p50": 87.5,
    "p95": 91.8,
    "jitter": 2.3,
    "stddev": 2.1,
    "samples": [86.1, 87.5, 88.3, 92.1, 89.5]
  },
  "status": "ok",
  "timestamp": "2026-03-11T12:00:01.234Z",
  "agentVersion": "1.2.0",
  "correlationId": "corr-uuid",
  "ttl": 2592000
}
```

### 3. `regions` (config)

Azure region metadata. Updated manually or via pipeline.

**Partition Key:** `id`

```json
{
  "id": "eastus",
  "displayName": "East US",
  "geography": "United States",
  "location": "Virginia",
  "lat": 37.3719,
  "lng": -79.8164,
  "agentUrl": "https://func-ping-eastus.azurewebsites.net",
  "enabled": true,
  "lastHealthCheck": "2026-03-11T11:59:00Z",
  "healthStatus": "healthy"
}
```

### 4. `aggregates` (materialized views)

Pre-computed hourly/daily summaries per region pair. Populated by Stream Analytics.

**Partition Key:** `pairKey` (e.g., `eastus_westeurope`)

```json
{
  "id": "eastus_westeurope_2026-03-11",
  "pairKey": "eastus_westeurope",
  "source": "eastus",
  "target": "westeurope",
  "date": "2026-03-11",
  "granularity": "daily",
  "stats": {
    "avgMs": 88.2,
    "p50Ms": 87.0,
    "p95Ms": 93.1,
    "p99Ms": 96.5,
    "minMs": 82.1,
    "maxMs": 99.3,
    "jitterAvg": 2.4,
    "sampleCount": 1450
  }
}
```

---

## Application Insights — Custom Telemetry Events

Every ping emits structured telemetry to Application Insights.

### Event: `PingMeasurement`

```json
{
  "name": "PingMeasurement",
  "properties": {
    "sessionId": "a1b2c3d4-...",
    "source": "eastus",
    "target": "westeurope",
    "protocol": "http",
    "status": "ok",
    "agentVersion": "1.2.0",
    "correlationId": "corr-uuid"
  },
  "measurements": {
    "latencyAvgMs": 88.7,
    "latencyP50Ms": 87.5,
    "latencyP95Ms": 91.8,
    "jitterMs": 2.3,
    "sampleCount": 5
  }
}
```

### Event: `PingSessionCompleted`

```json
{
  "name": "PingSessionCompleted",
  "properties": {
    "sessionId": "a1b2c3d4-...",
    "mode": "single",
    "sourceRegion": "eastus"
  },
  "measurements": {
    "durationMs": 8234,
    "regionsOk": 24,
    "regionsFailed": 0,
    "globalAvgMs": 92.3
  }
}
```

---

## Index Strategy (Cosmos DB)

| Container | Included Paths | Excluded Paths | Composite Indexes |
|---|---|---|---|
| sessions | `/status`, `/sourceRegion`, `/startedAt` | `/summary/*` | (`sourceRegion` ASC, `startedAt` DESC) |
| results | `/sessionId`, `/source`, `/target` | `/latency/samples` | (`source` ASC, `target` ASC) |
| aggregates | `/pairKey`, `/date`, `/source` | - | (`source` ASC, `date` DESC) |

## Cost Estimate

| Cosmos DB Config | Value |
|---|---|
| Provisioned throughput | 400 RU/s (autoscale to 4000) |
| Storage (30-day TTL) | ~5 GB |
| Est. monthly cost | ~$25-50 |
