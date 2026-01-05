# Agent simulation (local) — quick start

This repo includes a **local** (no API / no Redis) agent simulator that generates:
- message events
- ranking events
- cohort ground truth labels

## Run
From repo root:
```bash
npm run sim:agents
```

## Output
Creates a new folder under `sim_out/`:
- `events.jsonl` — one JSON object per line
- `ground_truth.json` — v1 labels (same cohort = friend)
- `manifest.json` — run config + seed

## Daily LLM integration (opinion + ranking)
The simulator now emits an LLM-ready event once per agent per day:
- `event_type: "daily_digest_request"`

This payload is intended to be sent to an LLM to:
- update the agent’s opinions about the other 4 group members
- produce that agent’s ranking for the day

For now, the simulator also emits:
- `opinion_update_fallback` (deterministic update)
- `ranking_submitted` with `source: "fallback_from_daily_digest"`

So you can iterate on the pipeline **without** needing network keys yet.

## Tuning
Edit defaults in:
- `scripts/simulate-agents.mjs` → `CONFIG`

## Spec
See:
- `docs/simulation-v1.md`
- `docs/agent-opinion-and-decision-model.md`


