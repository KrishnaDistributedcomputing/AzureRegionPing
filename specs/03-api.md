# 03 — API & Real-Time Contracts

## Overview

The API surface has two layers:
1. **REST endpoints** — Initiate pings, fetch regions, retrieve historical results.
2. **SignalR messages** — Real-time streaming of ping progress and results to the browser.

## Base URL

```
https://func-azureregionping.azurewebsites.net/api
```

---

## REST Endpoints

### GET /api/regions

Returns all Azure regions with their coordinates and agent status.

**Response `200 OK`**

```json
{
  "regions": [
    {
      "id": "eastus",
      "displayName": "East US",
      "location": "Virginia, USA",
      "lat": 37.3719,
      "lng": -79.8164,
      "agentUrl": "https://func-ping-eastus.azurewebsites.net",
      "status": "healthy",
      "lastHealthCheck": "2026-03-11T11:59:00Z"
    }
  ],
  "count": 25,
  "lastUpdated": "2026-03-11T12:00:00Z"
}
```

---

### POST /api/ping

Initiates a ping test from one or more source regions to all other regions.

**Request Body**

```json
{
  "mode": "single",            // "single" | "mesh"
  "sourceRegion": "eastus",    // required for "single" mode, ignored for "mesh"
  "samples": 5,                // pings per target (default: 5, max: 20)
  "protocol": "http"           // "http" | "tcp" (default: "http")
}
```

**Response `202 Accepted`**

```json
{
  "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "orchestrationId": "orch-uuid",
  "statusUrl": "/api/ping/a1b2c3d4-e5f6-7890-abcd-ef1234567890/status",
  "signalRNegotiateUrl": "/api/negotiate",
  "estimatedDurationMs": 8000,
  "message": "Ping test initiated. Connect to SignalR for real-time results."
}
```

---

### GET /api/ping/{sessionId}/status

Poll-based fallback if SignalR is unavailable.

**Response `200 OK`**

```json
{
  "sessionId": "a1b2c3d4-...",
  "status": "running",          // "running" | "completed" | "failed"
  "progress": {
    "total": 24,
    "completed": 18,
    "failed": 0
  },
  "results": [
    {
      "source": "eastus",
      "target": "westeurope",
      "latency": {
        "min": 85.2,
        "avg": 88.7,
        "max": 92.1,
        "p50": 87.5,
        "p95": 91.8,
        "jitter": 2.3,
        "samples": [86.1, 87.5, 88.3, 92.1, 89.5]
      },
      "status": "ok",
      "timestamp": "2026-03-11T12:00:01.234Z"
    }
  ]
}
```

---

### GET /api/results/{sessionId}

Retrieve a completed test for sharing/replay.

**Response `200 OK`**

```json
{
  "sessionId": "a1b2c3d4-...",
  "mode": "single",
  "sourceRegion": "eastus",
  "startedAt": "2026-03-11T12:00:00Z",
  "completedAt": "2026-03-11T12:00:08Z",
  "durationMs": 8234,
  "results": [ /* same PingResult[] as above */ ],
  "summary": {
    "fastestPair": { "source": "eastus", "target": "eastus2", "avgMs": 1.2 },
    "slowestPair": { "source": "eastus", "target": "australiaeast", "avgMs": 198.4 },
    "globalAvgMs": 92.3
  },
  "shareUrl": "https://azureregionping.com/r/a1b2c3d4"
}
```

---

### GET /api/results/latest

Returns the latest N completed tests for the landing page.

---

### POST /api/negotiate

SignalR negotiation endpoint (auto-handled by Azure Functions SignalR binding).

---

## SignalR Messages (Server → Client)

The browser connects to SignalR and joins channel `session-{sessionId}`.

### `ping-started`

Fired when the orchestrator begins. Triggers arc departure animations.

```json
{
  "type": "ping-started",
  "sessionId": "a1b2c3d4-...",
  "source": "eastus",
  "targets": ["westeurope", "southeastasia", "australiaeast", ...],
  "timestamp": "2026-03-11T12:00:00Z"
}
```

### `ping-arc-launched`

Fired per target when the ping agent starts measuring. The browser begins the arc animation.

```json
{
  "type": "ping-arc-launched",
  "source": "eastus",
  "target": "westeurope",
  "estimatedMs": 90
}
```

### `ping-result`

Fired as each region result arrives. Browser lands the arc, updates leaderboard.

```json
{
  "type": "ping-result",
  "source": "eastus",
  "target": "westeurope",
  "latency": {
    "min": 85.2, "avg": 88.7, "max": 92.1,
    "p50": 87.5, "p95": 91.8, "jitter": 2.3,
    "samples": [86.1, 87.5, 88.3, 92.1, 89.5]
  },
  "status": "ok",
  "rank": 12,
  "timestamp": "2026-03-11T12:00:01.234Z"
}
```

### `ping-complete`

All pings done. Browser shows summary, enables sharing.

```json
{
  "type": "ping-complete",
  "sessionId": "a1b2c3d4-...",
  "totalDurationMs": 8234,
  "summary": {
    "fastestPair": { "source": "eastus", "target": "eastus2", "avgMs": 1.2 },
    "slowestPair": { "source": "eastus", "target": "australiaeast", "avgMs": 198.4 },
    "globalAvgMs": 92.3,
    "regionsOk": 24,
    "regionsFailed": 0
  },
  "shareUrl": "https://azureregionping.com/r/a1b2c3d4"
}
```

### `ping-error`

Something went wrong for a specific region.

```json
{
  "type": "ping-error",
  "source": "eastus",
  "target": "brazilsouth",
  "error": "TIMEOUT",
  "message": "Agent did not respond within 5000ms"
}
```

---

## Error Responses (REST)

```json
{
  "error": {
    "code": "INVALID_REGION",
    "message": "Region 'fakeregion' is not a valid Azure region.",
    "requestId": "req-uuid"
  }
}
```

| HTTP Status | When |
|---|---|
| 400 | Invalid mode, region, or samples count |
| 404 | Session not found |
| 429 | Rate limited (max 10 tests/minute per IP) |
| 500 | Unexpected server error |
| 503 | Region agent unhealthy |

## Rate Limiting

- 10 ping tests per minute per client IP.
- Mesh mode counts as 1 test.
- Rate limiting enforced at the API Management layer.
