# AzureRegionPing

A telemetry-driven application that measures and visualizes latency between Azure regions with animated 3D globe traffic flow.

## Project Structure

```
├── specs/                    # Specification documents
├── frontend/                 # React + TypeScript + globe.gl
├── functions/
│   ├── orchestrator/         # Durable Functions (central)
│   └── ping-agent/           # Lightweight ping agent (per-region)
├── infra/                    # Bicep IaC templates
├── .github/workflows/        # CI/CD pipelines
└── shared/                   # Shared types and constants
```

## Quick Start

```bash
# Frontend
cd frontend && npm install && npm run dev

# Orchestrator (local)
cd functions/orchestrator && npm install && func start

# Ping Agent (local)
cd functions/ping-agent && npm install && func start --port 7072
```

## Specs

See [specs/README.md](specs/README.md) for full specification documents.
