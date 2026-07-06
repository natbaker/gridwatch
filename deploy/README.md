# deploy

Terraform configuration for deploying Gridwatch and its self-hosted OpenF1 stack to a MicroK8s Kubernetes cluster (on `scruffy`).

## Overview

Applies to the `gridwatch` namespace on MicroK8s. Two root modules:

- **`gridwatch.tf`** — The Gridwatch app itself: Docker image build & push, deployment, service, ingress (public at `f1.dumpsterfire.xyz`), and an IP-restricted `/admin` ingress.
- **`openf1.tf`** — The full self-hosted OpenF1 stack: MongoDB, MQTT (Mosquitto), OpenF1 API + realtime ingestor, and supporting CronJobs.

## OpenF1 Stack

The OpenF1 modules (`openf1-*`) are built from a separate checkout at `~/git/openf1`, tagged with the latest commit SHA and pushed to the local MicroK8s registry (`localhost:32000`).

**CronJobs:**
| Name | Schedule | Purpose |
|---|---|---|
| `openf1-ingest-schedule` | Daily 04:00 | Ingest meetings and sessions |
| `openf1-ingest-results` | Hourly at :15 | Ingest session results and starting grids |
| `openf1-gap-fill` | Daily 03:00, 15:00 | Import timing data not yet in local MongoDB (full bootstrap on first run) |
| `openf1-refresh-token` | Daily 06:00 | Refresh F1TV subscription token (expires ~4 days) and restart ingest |
| `openf1-scale-ingest` | Every 30 min | Scale realtime ingestor to 1 during sessions, 0 otherwise |

## Usage

```bash
cd deploy
terraform plan
terraform apply
```

Requires `GRIDWATCH_ADMIN_TOKEN`, `F1TV_EMAIL`, and `F1TV_PASSWORD` in `terraform.tfvars` (not checked in — see `.gitignore`).

## Scripts

- `scripts/f1tv-refresh/refresh_token.py` — Fetches a fresh F1TV token via the F1 auth API
- `scripts/openf1-scaler/scale_ingest.py` — Session-aware scaler that reads the OpenF1 API schedule
