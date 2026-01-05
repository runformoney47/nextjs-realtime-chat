# Simulation v1 (local) — 5 cohorts × 20 agents, circadian “days”

This doc defines the **first runnable simulation** for generating a dataset for friendship prediction research.

## Goals
- Generate realistic-ish **message cadence** driven by a per-agent circadian rhythm (“energy”).
- Collect **rankings** inside each chat group once per simulated day.
- Output a clean **event log** and **ground truth labels** for downstream data science.

## Scale
- **Agents**: 100 total
- **Cohorts**: 5 cohorts × 20 agents each
- **Simulated time**: \(N\) days (configurable)
- **Day length**: 24h simulated time

## Grouping strategy (daily)
Per cohort, each simulated day:
- Shuffle the 20 agents.
- Partition into **4 groups of 5**.
- Each group produces a chat “room” id:
  - `cohort_<cohortId>/day_<dayIndex>/group_<groupIndex>`

## Energy model (circadian)
Each agent has:
- `chronotypeShiftHours` (phase shift)
- `baseActivity` (how active they tend to be)
- `responsiveness` (how strongly they respond to incoming messages)

Energy over the day:
- `energy(t)` is a periodic curve (cosine) with phase shift + baseline + noise.
- Energy drives:
  - probability the agent “checks chat”
  - probability the agent sends a message

## Messaging rhythm (MVP)
Time is discretized into 5-minute ticks.
At each tick, per agent:
- compute energy
- if the agent is assigned to a group that day, they may send a message to that group
- messages are short template strings (no real NLP yet)

## Rankings (daily)
Once per day, per group:
- each agent submits a ranking of the **other 4 members**
- the ordering is sampled from a latent “affinity” matrix within cohort

## Outputs
The simulator produces:
- `sim_out/<runId>/events.jsonl`
  - append-only event stream (messages, rankings, energy samples)
- `sim_out/<runId>/ground_truth.json`
  - cohort membership and pairwise labels (v1: same cohort = positive)
- `sim_out/<runId>/manifest.json`
  - run parameters (seed, day count, etc.)

## Event schema (JSONL)
Each line is one event:
```json
{
  "run_id": "run_...",
  "ts_sim": { "day": 0, "minute": 123 },
  "event_type": "message_sent",
  "cohort_id": "c0",
  "group_id": "cohort_c0/day_0/group_2",
  "agent_id": "a_c0_07",
  "payload": { "...": "..." }
}
```

## Run it
From repo root:
```bash
npm run sim:agents
```


