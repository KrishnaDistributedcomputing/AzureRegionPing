# 01 — Project Overview

## Vision

AzureRegionPing is a **telemetry-driven, visually immersive** application that measures network latency **between Azure regions** and lets users watch traffic flow across the globe in real time. When you fire a ping, you see an animated particle arc from one region to another, with color-coded speed, jitter visualization, and a satisfying "arrival" effect. It's equal parts engineering tool and visual showcase.

## Core Experience

1. **Open the app** → A 3D globe (or stylized 2D world map) shows all Azure regions as glowing nodes.
2. **Select a source region** → The node pulses and highlights.
3. **Hit "Ping All"** → Animated light trails shoot out from the source to every other region. Each trail's speed and color reflects actual measured latency.
4. **Watch results stream in** → A live leaderboard sorts as results arrive. The globe lights up with a heat-map overlay.
5. **Click any region pair** → See detailed telemetry: latency histogram, jitter, packet loss, hop trace, percentile breakdown.
6. **"Mesh Mode"** → Fire pings from ALL regions simultaneously. The globe erupts with criss-crossing light trails. A full NxN latency matrix populates in real time.

## Goals

- Measure **region-to-region** latency (not just client-to-region) using distributed Azure Functions.
- Deliver a **"wow" visual experience** — animated arcs, particles, glow effects, real-time streaming.
- Deep **telemetry observability** — every ping produces structured telemetry routed through Application Insights with custom dashboards.
- Show **how traffic flows** — trace the path, visualize hops when possible.
- Make it **shareable** — generate a unique URL for any test result with an embedded animated replay.

## Non-Goals (v1)

- Throughput/bandwidth testing (latency only).
- Private/government cloud regions.
- Custom VNET or ExpressRoute path testing.
- User accounts (anonymous, session-based).

## Target Users

- **Developers & architects** choosing regions for multi-region deployments.
- **DevOps engineers** diagnosing cross-region latency issues.
- **Conference demos / presentations** — the visual wow factor.
- **Azure evangelists** showcasing global infrastructure.

## Success Criteria

| Metric | Target |
|---|---|
| Regions covered | ≥ 25 public Azure regions |
| Single region ping-all completes in | < 10 seconds |
| Full mesh (25×25) completes in | < 30 seconds |
| Animation frame rate | 60 FPS on modern hardware |
| Telemetry ingestion lag | < 2 seconds (ping → dashboard) |
| Page load (first meaningful paint) | < 3 seconds |

## Differentiators

| Feature | Typical ping tools | AzureRegionPing |
|---|---|---|
| Visual traffic flow | ❌ Table only | ✅ Animated globe arcs |
| Region-to-region | ❌ Client only | ✅ Distributed mesh |
| Live streaming results | ❌ Batch | ✅ SignalR real-time |
| Telemetry depth | ❌ Just ms | ✅ Histograms, jitter, percentiles |
| Shareability | ❌ | ✅ Unique result URLs w/ replay |
