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

## Agent Setup (local app)
If you are running the Next.js app locally with `AGENT_MODE=true`, an admin can use the
**Agent Setup** button on:
- `/dashboard/admin/health`

It will:
- clear sim-related Redis keys (chats/rankings/schedule/user assignments)
- create users with ids/names **0..99**
- create 20 group chats of 5 users and assign each user a `current_group_chat`

Then you can instantly log in as an agent with:
- `/agent/login?userId=0` (or 1..99)

## Primitive “agents in the system” (bots sending messages + rankings)
For an extremely simple first pass, we expose agent-only endpoints (gated by `AGENT_MODE`):
- `GET /api/agent/state?userId=...`
- `GET /api/agent/messages?userId=...&chatId=...&limit=...`
- `POST /api/agent/send?userId=...&chatId=...&text=...`
- `POST /api/agent/rank?userId=...&chatId=...&rankings=<json>`
- `GET /api/agent/opinions?userId=...&chatId=...`
- `POST /api/agent/opinions?userId=...&chatId=...&dayIndex=...&opinions=<json>`

Recommended env vars (local):
- `AGENT_MODE=true`
- `AGENT_API_SECRET=<some-random-string>`

Run the primitive runner (assumes your app is running at `http://localhost:3000`):
```bash
AGENT_MODE=true AGENT_API_SECRET=dev-secret npm run agents:run
```

### LLM-driven messages (optional)
If you set these env vars, the runners can generate message content via an OpenAI-compatible
`/chat/completions` endpoint:
- `AGENT_USE_LLM=true`
- `OPENAI_API_KEY=...`
- `OPENAI_MODEL=gpt-4o-mini` (or any model your provider supports)
- `OPENAI_BASE_URL=https://api.openai.com/v1` (optional; for OpenAI-compatible providers)

Optional knobs:
- `AGENT_BASE_URL` (default `http://localhost:3000`)
- `AGENT_MESSAGES` (default `200`)
- `AGENT_RANK_EVERY` (default `25`)

## Day-by-day schedule advancement
`Agent Setup` writes:
- `schedule:master`: array of **epochs**, where each epoch is an array of groups
- `schedule:epoch_length`: how many **days** each group chat lasts (default **3**)

We track the currently-applied day in Redis:
- `schedule:current_day` (starts at `-1`)
- `group_chats:active` tracks the currently-active group chats for the current epoch

To advance to the next day:
- the day counter increments every time
- **group chats only rebuild when the epoch changes** (every 3 days by default)
```bash
AGENT_MODE=true AGENT_API_SECRET=dev-secret npm run schedule:advance
```

To apply a specific day:
```bash
AGENT_MODE=true AGENT_API_SECRET=dev-secret npm run schedule:advance -- --day=0
```

To run activity day-by-day:
```bash
AGENT_MODE=true AGENT_API_SECRET=dev-secret SIM_DAYS=3 MESSAGES_PER_DAY=200 npm run agents:daybyday
```

## Opinions + end-of-day rankings
During `agents:daybyday`, at the end of each simulated day each agent:
- updates a **single** opinion scalar about each other member:
  - `interest_overlap` in `[-1, +1]`
- submits a ranking (position 1 = best) via `/api/agent/rank` derived from that scalar

Redis keys:
- `agent_opinion:user:<me>:about:<other>` → JSON with the opinion vector + metadata
- `agent_opinion_snapshot:user:<me>:chat:<chatId>:day:<dayIndex>` → per-day snapshot (optional)
- `chat:<chatId>:user:<me>:rankings` → ranking array for UI
- `chat:<chatId>:user:<me>:rankings:compat_llm` → optional LLM “compatibility” ranking (stored separately)
- `survey:*` indexes record ranking transitions/snapshots (see `src/lib/surveys.ts`)

### Fast feedback mode (rankings update after every message)
In `scripts/run-agents-daybyday.mjs`, after each agent sends a message, we recompute:
- `interest_overlap` per other member using a **keyword overlap heuristic** based on the agent's `style.interests`
- the ranking derived from those scores

### Optional LLM-based compatibility ranking (alternate)
This asks the LLM: “Read the chats and, based on your interests/personality, rank members most compatible → least compatible.”

Enable it (example: rank every 10 messages total across the run):
```bash
AGENT_USE_LLM=true AGENT_COMPAT_RANK_LLM=true AGENT_COMPAT_RANK_EVERY=10 npm run agents:daybyday
```

It will submit rankings to:
- `/api/agent/rank?type=compat_llm`
- Redis key `chat:<chatId>:user:<me>:rankings:compat_llm`



