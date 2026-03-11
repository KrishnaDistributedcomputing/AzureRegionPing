# 05 — Infrastructure

## Resource Topology

```
                    ┌─────────────────────────────────┐
                    │  rg-azureregionping-core         │
                    │  (Central — East US 2)           │
                    │                                  │
                    │  ├─ swa-azureregionping          │  Static Web App (frontend)
                    │  ├─ func-azureregionping-orch    │  Orchestrator Function App
                    │  ├─ signalr-azureregionping      │  Azure SignalR Service
                    │  ├─ cosmos-azureregionping       │  Cosmos DB (global)
                    │  ├─ appi-azureregionping         │  Application Insights
                    │  ├─ evhns-azureregionping        │  Event Hubs Namespace
                    │  ├─ asa-azureregionping          │  Stream Analytics Job
                    │  └─ st-azureregionping           │  Storage (Function state)
                    └─────────────────────────────────┘

    ┌────────────────┐  ┌────────────────┐       ┌────────────────┐
    │ rg-ping-eastus │  │ rg-ping-westeu │  ...  │ rg-ping-seasia │
    │                │  │                │       │                │
    │ func-ping-     │  │ func-ping-     │       │ func-ping-     │
    │  eastus        │  │  westeurope    │       │  southeastasia │
    │ (Consumption)  │  │ (Consumption)  │       │ (Consumption)  │
    └────────────────┘  └────────────────┘       └────────────────┘
         25+ regions, each with a lightweight ping agent Function App
```

## Azure Resources — Core (Central Region)

| Resource | SKU / Tier | Purpose |
|---|---|---|
| Azure Static Web App | Free | React frontend hosting |
| Azure Functions (Orchestrator) | Consumption (EP1 if high traffic) | Durable Functions orchestrator |
| Azure SignalR Service | Free (20 concurrent) → Standard | Real-time push to browsers |
| Azure Cosmos DB | Serverless or 400 RU/s autoscale | Sessions, results, aggregates |
| Application Insights | Pay-as-you-go | Telemetry, logging, metrics |
| Event Hubs | Basic (1 TU) | Raw telemetry event stream |
| Stream Analytics | 1 SU | Real-time aggregation |
| Storage Account | Standard LRS | Function App state + Durable task hub |

## Azure Resources — Per Region (×25)

| Resource | SKU / Tier | Purpose |
|---|---|---|
| Azure Functions (Ping Agent) | Consumption | Lightweight ping agent |
| Storage Account | Standard LRS | Function App state |

## Regions to Deploy Ping Agents

| # | Region ID | Display Name |
|---|---|---|
| 1 | eastus | East US |
| 2 | eastus2 | East US 2 |
| 3 | westus | West US |
| 4 | westus2 | West US 2 |
| 5 | westus3 | West US 3 |
| 6 | centralus | Central US |
| 7 | northcentralus | North Central US |
| 8 | southcentralus | South Central US |
| 9 | canadacentral | Canada Central |
| 10 | brazilsouth | Brazil South |
| 11 | northeurope | North Europe |
| 12 | westeurope | West Europe |
| 13 | uksouth | UK South |
| 14 | francecentral | France Central |
| 15 | germanywestcentral | Germany West Central |
| 16 | swedencentral | Sweden Central |
| 17 | norwayeast | Norway East |
| 18 | southeastasia | Southeast Asia |
| 19 | eastasia | East Asia |
| 20 | japaneast | Japan East |
| 21 | koreacentral | Korea Central |
| 22 | australiaeast | Australia East |
| 23 | centralindia | Central India |
| 24 | uaenorth | UAE North |
| 25 | southafricanorth | South Africa North |

## Infrastructure as Code — Bicep

```
infra/
├── main.bicep                    # Top-level orchestrator
├── parameters.dev.bicepparam
├── parameters.prod.bicepparam
├── modules/
│   ├── core/
│   │   ├── staticWebApp.bicep
│   │   ├── orchestratorFunc.bicep
│   │   ├── signalr.bicep
│   │   ├── cosmosdb.bicep
│   │   ├── eventHub.bicep
│   │   ├── streamAnalytics.bicep
│   │   ├── appInsights.bicep
│   │   └── storage.bicep
│   └── agent/
│       ├── pingAgent.bicep       # Parameterized per region
│       └── storage.bicep
└── scripts/
    ├── deploy-core.sh
    ├── deploy-agents.sh          # Loop over regions
    └── health-check.sh
```

### Deployment Strategy

1. **Core resources** deployed first to East US 2.
2. **Ping agents** deployed in parallel to all 25 regions using a loop in `main.bicep`:

```bicep
@description('List of Azure regions to deploy ping agents')
param pingRegions array = [
  'eastus', 'eastus2', 'westus', 'westus2', 'westus3',
  'centralus', 'northcentralus', 'southcentralus',
  'canadacentral', 'brazilsouth',
  'northeurope', 'westeurope', 'uksouth', 'francecentral',
  'germanywestcentral', 'swedencentral', 'norwayeast',
  'southeastasia', 'eastasia', 'japaneast', 'koreacentral',
  'australiaeast', 'centralindia', 'uaenorth', 'southafricanorth'
]

module pingAgents 'modules/agent/pingAgent.bicep' = [for region in pingRegions: {
  name: 'deploy-ping-${region}'
  params: {
    location: region
    appInsightsConnectionString: core.outputs.appInsightsConnectionString
    orchestratorUrl: core.outputs.orchestratorUrl
  }
}]
```

## CI/CD — GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy AzureRegionPing

on:
  push:
    branches: [main]

jobs:
  deploy-infra:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: azure/login@v2
      - run: az deployment sub create --location eastus2 --template-file infra/main.bicep

  deploy-frontend:
    needs: deploy-infra
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd frontend && npm ci && npm run build
      - uses: Azure/static-web-apps-deploy@v1

  deploy-orchestrator:
    needs: deploy-infra
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd functions/orchestrator && npm ci && npm run build
      - run: func azure functionapp publish func-azureregionping-orch

  deploy-agents:
    needs: deploy-infra
    runs-on: ubuntu-latest
    strategy:
      matrix:
        region: [eastus, eastus2, westus, westus2, westus3, ...]
    steps:
      - uses: actions/checkout@v4
      - run: cd functions/ping-agent && npm ci && npm run build
      - run: func azure functionapp publish func-ping-${{ matrix.region }}
```

## Networking & Security

| Concern | Approach |
|---|---|
| Agent-to-agent auth | Function-level API keys (rotated via Key Vault) |
| Browser-to-orchestrator | HTTPS only, CORS restricted to SWA domain |
| Rate limiting | API Management policy or custom middleware (10 req/min/IP) |
| Secrets | Azure Key Vault, referenced in Function App settings |
| No public storage | All storage accounts have public access disabled |

## Monitoring & Alerts

| Alert | Condition | Action |
|---|---|---|
| Agent unhealthy | Health check fails 3× in 5 min | PagerDuty / Teams notification |
| High latency | Orchestrator p95 > 15 sec | Auto-scale to EP1 |
| Cosmos throttled | 429 responses > 10/min | Increase RU/s |
| Function errors | Error rate > 5% over 5 min | Teams notification |

## Estimated Monthly Cost

| Resource | Est. Cost |
|---|---|
| Static Web App (Free) | $0 |
| Orchestrator Function (Consumption) | ~$5 |
| 25× Ping Agent Functions (Consumption) | ~$10 |
| SignalR (Free → Standard) | $0–$50 |
| Cosmos DB (Serverless) | ~$15 |
| Event Hubs (Basic) | ~$11 |
| Stream Analytics (1 SU) | ~$80 |
| Application Insights | ~$10 |
| 26× Storage Accounts | ~$5 |
| **Total (low usage)** | **~$50–$185/mo** |
| **Total (without Stream Analytics)** | **~$50–$105/mo** |

> **Cost optimization:** Stream Analytics can be replaced with a timer-triggered Azure Function for aggregation, reducing cost by ~$80/mo.
