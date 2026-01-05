# Agent opinion + decision model (v1→vN)

This doc focuses on **how agents interpret each other’s messages** and **form opinions** that later drive:
- who they message
- how quickly they respond
- how they rank others

It’s written so you can start with simple heuristics (v1) and later upgrade to richer NLP / learned policies.

---

## 0) The core idea

Each agent maintains a **latent opinion score** about every other agent they interact with.

At any point in time:
- **messages** → update **opinion state**
- opinion state → drives **behavior**

Think of it like how humans build impressions:
> “They’re funny”, “they’re rude”, “they respond fast”, “they ignore me”, “we click”.

---

## 1) What does an “opinion” look like?

You’ll want at least two layers:

### A) A single scalar score (easy)
- `opinion[i][j] ∈ [-1, +1]`  
  - -1 = dislike
  - 0 = neutral
  - +1 = like / affinity

This is enough for v1 ranking generation.

### B) A small vector of interpretable traits (better)
Keep 4–8 dimensions that you can reason about:
- `warmth` (supportive vs cold)
- `competence` (helpful vs confusing)
- `humor`
- `trust`
- `responsiveness` (fast replies, reciprocity)
- `similarity` (shared topics/style)

Then define scalar affinity as a weighted sum:
- `affinity = w · traits`

This is often a sweet spot: richer than one number, still controllable.

#### v1 recommended affinity vector (small + explainable)
For your first “content-first” version, keep the vector small and interpretable:

- **`warmth`**: supportive / kind vs cold / dismissive
- **`respect`**: polite vs rude (separate from warmth)
- **`humor`**: funny / playful vs boring
- **`trust`**: reliable / honest vs flaky
- **`interest_overlap`**: shared topics/values/style

All dimensions are stored as **numbers in [-1, +1]**.

Then compute scalar affinity for ranking/targeting as:

- `affinity = 0.30*warmth + 0.25*respect + 0.15*humor + 0.15*trust + 0.15*interest_overlap`

You can change weights later, but pick a default and log it in `manifest.json` so runs are comparable.

---

## 2) What information does an agent use to update opinion?

Split “signals” into two categories:

### A) **Behavioral signals** (don’t require NLP)
These often end up *very predictive* of social closeness:
- **reply latency** (how fast they reply to you)
- **reciprocity** (do they respond at all?)
- **conversation depth** (do exchanges continue or die quickly?)
- **message volume balance** (one-sided vs balanced)
- **initiative** (do they start conversations?)
- **consistency** (stable pattern vs chaotic)

### B) **Content signals** (requires text processing)
Start simple; you can get far without advanced models:
- sentiment/polarity (positive/negative tone)
- toxicity/rudeness heuristics
- “agreement” cues vs “disagreement” cues
- topic overlap
- stylistic similarity (emoji use, length)

In early phases you can use templated text and treat “content signals” as synthetic tags in the payload.

---

## 3) The agent cognition loop (per incoming message)

When agent `i` receives a message from agent `j`:

1) **Perceive**
   - extract features from the message + context:
     - `sentiment`, `toxicity`, `topic`, `length`
     - `was_reply_to_i?`
     - `time_since_last_i_to_j`

2) **Update memory**
   - store a short rolling buffer per counterparty:
     - last N messages
     - last interaction timestamps
   - store aggregate stats:
     - average reply time, response rate, etc.

3) **Update opinion state**
   - apply a simple update rule (below)

4) **Decide action**
   - respond now / later / ignore
   - if respond: choose style + content

---

## 3.5) Daily LLM “digest” (recommended for feasibility)

If you plan to use real LLM calls at scale (e.g. **100 agents × 20 messages/day**),
you generally **should not** call the LLM for every (message × recipient) opinion update.

Instead, do a **once-per-day digest**:

- For each agent `i`, once per simulated day:
  - Provide a compact summary of the day’s interactions in their group(s).
  - Provide the current opinion state for the other members.
  - Ask the LLM to return:
    - updated opinion state (vector or scalar) for each other member
    - ranking of the other members (plus confidence / reasons)

This keeps LLM call counts manageable:
- **Messages:** ~2,000 calls/day (1 per message)
- **Daily digests:** +100 calls/day (1 per agent per day)

Total stays ~2,100 calls/day, rather than exploding to 10k+.

### Suggested digest input (keep it small)
- Persona summary (5–10 lines)
- Group membership for the day
- A “conversation summary” (10–20 bullets or a short paragraph)
- Last 5–10 message snippets (optional)
- Current opinions for the other 4 members (short JSON)

### Suggested digest output
- Updated opinions for other members (JSON)
- Ranked list (1..4)
- Optional: short reason codes (for debugging, not for training)

---

## 4) Opinion update rules (simple but effective)

### v1: Exponentially weighted moving average (EWMA)
Maintain `opinion` as a smoothed value that reacts but doesn’t thrash:

- `opinion ← (1-η)·opinion + η·signal`

Where:
- `η` is a learning rate (e.g. 0.05–0.2)
- `signal` is a weighted combination of features mapped into [-1, +1]

Example signal (behavior-heavy):
- `signal = +0.4*(fast_reply) +0.3*(positive_tone) -0.6*(rude) +0.2*(topic_match)`

### v2: Separate “short-term mood” and “long-term opinion”
Humans get annoyed temporarily but don’t instantly hate someone.

Maintain:
- `mood[i][j]` (reacts quickly)
- `opinion[i][j]` (slow)

Update:
- `mood ← (1-η_fast)·mood + η_fast·signal`
- `opinion ← (1-η_slow)·opinion + η_slow·mood`

This produces realistic “forgive/forget” behavior.

### v3: Add uncertainty (agents aren’t sure early on)
Track confidence `conf[i][j]` that rises with interactions:
- new person → low confidence → smaller updates
- lots of history → higher confidence → stable opinion

Implementation: scale η by confidence.

---

## 5) Turning opinions into behavior

Your sim needs two decision layers:

### A) **When to act** (activity)
Driven by circadian energy + Hawkes/replies:
- if energy is high and there’s an unread message, likely respond
- if energy low, delay

### B) **Who to act toward** (target selection)
Choose a target with probability proportional to something like:
- `P(j) ∝ exp( temperature * affinity[i][j] )`

This naturally biases you toward friends but still allows exploration.

### C) **What to say** (content policy)
For v1: templates conditioned on opinion and last message type:
- high affinity → supportive/curious templates
- low affinity → short/neutral templates
- very low + high energy → conflict templates (optional)

For vN: replace templates with an LLM policy if desired.

---

## 6) Turning opinions into rankings (daily)

Inside each daily group of 5:
- rank the other 4 by `affinity[i][j]`
- add small noise so rankings are not perfectly deterministic

This gives you:
- stable but not identical rankings
- signal to learn from

---

## 7) What to log (so DS is easy)

For every opinion update, log a compact event:
- `ts_sim`, `agent_id=i`, `other_id=j`
- `signal_components` (reply_latency_score, sentiment_score, etc.)
- `mood_before/after`, `opinion_before/after`, `confidence`

This lets you later check:
- did the sim behave sensibly?
- which signals drove rankings?

---

## 8) Suggested implementation phases

1) **Behavior-only opinion** (reply time, reciprocity) + ranking from opinion
2) Add minimal content tags (positive/negative) in messages and incorporate them
3) Add short-term mood + long-term opinion separation
4) Add uncertainty/confidence scaling
5) Optional: Hawkes-style reply cascades + richer NLP


