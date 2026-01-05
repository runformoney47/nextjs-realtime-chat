# Messaging rhythms for agent simulation (layperson guide + papers)

This guide explains **why human messaging looks “bursty” and daily‑cyclical**, and how to model that in a simulator (like our `scripts/simulate-agents.mjs`) without turning it into a huge research project.

It’s written in **layman’s terms first**, then points you to the papers for the math.

---

## 1) What you’re trying to mimic (in plain English)

Real people don’t message like a metronome.

Instead, most messaging apps show 4 patterns:

- **Daily rhythm (circadian/diurnal)**: people sleep, work, commute → activity rises/falls during the day.
- **Sessions**: people open the app, send a few messages, leave.
- **Bursts**: once a conversation starts, messages tend to come quickly for a while (replies).
- **Long gaps**: the time between messages can be *minutes* or *hours/days* — the distribution has a “long tail”.

If you build an agent that sends a message every fixed interval, it will look fake and generate unrealistic data.

---

## 2) The simplest “good” model (recommended starting point)

### **Circadian‑modulated sessions**

Think: *once in a while the agent “checks chat”; when they do, they send a small burst.*

Ingredients:

- **Circadian curve** \(c(t)\): “how awake/active are you at time \(t\) of the day?”
  - Example: low at night, high mid‑day/evening, varies per person (chronotype).
- **Session start probability**: higher when \(c(t)\) is high.
- **Burst size**: when a session starts, send \(K\) messages where \(K\) is random (often 1–6).
- **Within‑burst delays**: short (seconds to minutes).

Why it works:
- It automatically creates **bursts + gaps + daily cycles**.
- It’s easy to tune to hit a target “messages per agent per day”.

If you only implement one model first, make it this one.

---

## 3) “Heavy tails” in waiting times (why gaps are so variable)

### What “heavy tail” means (no math)
If you histogram the time between messages, you don’t get a neat “bell curve”.
You get:
- lots of short gaps (seconds/minutes)
- fewer medium gaps (tens of minutes)
- *still* a noticeable number of very long gaps (hours/days)

This is a big reason simple Poisson “constant rate” messaging looks wrong.

### Two common explanations/models

#### A) **Priority/queue model (task‑driven behavior)**
People choose what to do next based on priorities (“reply now” vs “later”), which produces bursty behavior and long delays.

**Paper (classic):**
- Barabási (2005), *The origin of bursts and heavy tails in human dynamics* (Nature)  
  Links:
  - Publisher page (paywalled): `https://www.nature.com/articles/nature03459`
  - Free preprint (arXiv): `https://arxiv.org/abs/cond-mat/0505371` (PDF: `https://arxiv.org/pdf/cond-mat/0505371.pdf`)

#### B) **Circadian + heterogeneous rates (mixing simple processes can look heavy‑tailed)**
If you combine:
- daily cycles,
- different people with different base activity,
you can see heavy‑tail‑like behavior even if each local process is relatively simple.

**Paper (very relevant for “circadian day” sims):**
- Malmgren et al. (2008), *A Poissonian explanation for heavy tails in e‑mail communication* (PNAS)  
  Link: `https://www.pnas.org/doi/10.1073/pnas.0800332105`

If that PNAS page is paywalled for you, two good alternatives that cover the same “circadian + heterogeneity + burstiness” idea from an implementation perspective:
- Holme & Saramäki (2012), *Temporal networks* (review; broad, very useful context)  
  Free preprint: `https://arxiv.org/abs/1108.1780`
- Start with the Barabási arXiv preprint above, then use the Hawkes tutorial below for burst/reply modeling.

**Takeaway:** you don’t necessarily need exotic math to get realistic gap distributions; circadian + heterogeneity + sessions often gets you most of the way there.

---

## 4) Self‑excitation (“replies cause replies”) — Hawkes processes

### Intuition (no math)
When someone messages you, your chance of replying **jumps up** for a bit, then fades.

That “message triggers more messages” feedback produces realistic conversational bursts.

### When you should use it
Use a Hawkes‑style model when you care about:
- realistic reply chains,
- “one message wakes up the chat” dynamics,
- distinguishing “active conversation” vs “quiet chat”.

### Core references
- Hawkes (1971), *Spectra of some self‑exciting and mutually exciting point processes* (Biometrika)  
  Link (often paywalled): `https://doi.org/10.1093/biomet/58.1.83`

Practical tutorial / implementation‑friendly overview:
- Laub, Taimre, Pollett (2015), *Hawkes Processes* (tutorial)  
  Links:
  - arXiv: `https://arxiv.org/abs/1507.02822` (PDF: `https://arxiv.org/pdf/1507.02822.pdf`)

---

## 5) Circadian patterns in real online behavior (why “daily cycle” is a must)

If you want your “energy” variable to be grounded, the key point is: **humans show strong diurnal patterns in many online signals**, driven by sleep/work schedules.

One well‑known large‑scale example (not messaging per se, but demonstrates diurnal structure clearly):
- Golder & Macy (2011), *Diurnal and seasonal mood vary with work, sleep, and daylength across diverse cultures* (Science)  
  Link (paywalled): `https://www.science.org/doi/10.1126/science.1202775`

For communication records (mobile/email), many datasets show daily periodicity + burstiness; you can also look at:
- Candia et al. (2008), *Uncovering individual and collective human dynamics from mobile phone records* (J. Phys. A)  
  Link (may be paywalled depending on region): `https://iopscience.iop.org/article/10.1088/1751-8113/41/22/224015`

If either of the above are paywalled, you can still get a strong “daily cycle is real” grounding from the open *Temporal networks* review:
- Holme & Saramäki (2012) arXiv: `https://arxiv.org/abs/1108.1780`

---

## 6) Mapping these ideas to our simulator (concrete knobs)

Here are the knobs you’ll typically want, regardless of which model you pick:

- **Chronotype / phase shift**: “early bird” vs “night owl”
  - shifts the peak of \(c(t)\)
- **Base activity**: overall talkativeness
- **Session rate**: how often they open the app
- **Burst size**: how many messages per session
- **Reply excitation strength** (optional): how strongly incoming messages trigger replies
- **Decay** (optional): how fast that excitation fades

### A pragmatic build order (lowest risk)
1) Circadian curve \(c(t)\) + sessions + burst size (fast, stable).
2) Add “reply burst” bonus (cheap Hawkes approximation).
3) If needed, upgrade to a real Hawkes process.

---

## 6.5) “Session model” — a simple recipe that looks human

If you want something that looks like real chat behavior without deep math, implement:

- **Session starts** (when someone “opens the app”)
  - Probability rises when energy is high.
- **Burst size** \(K\)
  - Most sessions are short (1–3 messages), some longer (5–15).
- **Within-session tempo**
  - Short delays (seconds/minutes simulated time).
- **Between-session gaps**
  - Longer, often variable (minutes/hours simulated time).

A practical choice that works well:
- \(K \sim\) geometric distribution (many small bursts, few big ones).
- between-session gap \(\Delta\) \(\sim\) lognormal (gives a long tail).

You don’t need to “perfectly” match theory at first—just match three metrics:
- messages per agent per day
- sessions per agent per day
- inter-event gaps have many short + some long

---

## 6.6) Hawkes without the heavy math: “reply excitation” approximation

If you don’t want to implement a full Hawkes sampler yet, use this approximation:

- Maintain a per-agent “reply pressure” score \(x\) that decays over time.
- When the agent receives a message, bump \(x\) up.
- Make message probability increase with \(x\).

In pseudocode (discrete time ticks):

```text
// every tick
x = x * decay
p_send = base_rate * circadian_energy + alpha * x
if rand() < p_send: send_message()

// on receiving a message
x += bump
```

This gives you:
- bursts and reply chains
- controllable intensity (alpha/bump)
- easy calibration

Later, if you need more rigor, move to a continuous-time Hawkes process.

---

## 7) Calibration checklist (how to “dial it in”)

When your goal is “a simulated day should look like a real day”, do this:

1) **Pick target stats**
   - messages sent per agent per day (you suggested 20)
   - sessions per agent per day (often 5–20 depending on cohort)
   - distribution of burst sizes (mostly 1–3, sometimes 10+)
   - quiet hours (low activity window)

2) **Run 7–30 simulated days**
   - Use a fixed seed for reproducibility.

3) **Measure**
   - per-agent/day message count histogram
   - inter-event gap histogram (log scale helps)
   - burst size histogram

4) **Adjust knobs**
   - too few messages/day → increase base rate or session start rate
   - too many tiny gaps → reduce within-session speed or reduce excitation
   - not enough long gaps → make between-session gap distribution heavier-tailed
   - activity too flat across day → strengthen circadian amplitude

5) **Lock parameters**
   - Save them as part of the run manifest (so experiments are comparable).

---

## 8) More open-access reading (free)

If you want more free materials beyond the core ones already linked:

### Hawkes / self-exciting processes
- Laub, Taimre, Pollett (2015) tutorial (arXiv): `https://arxiv.org/abs/1507.02822`
- Bacry, Mastromatteo, Muzy (2015), *Hawkes processes in finance* (review; lots of intuition and methods)  
  Free preprint: `https://arxiv.org/abs/1502.04592`

---

## 9) How to calibrate (so it looks human)

Even without perfect theory, you can tune the sim to match 3 observable targets:

1) **Messages per agent per day** (mean + variance)
2) **Session count per agent per day**
3) **Inter‑event time distribution** shape (lots of short gaps + some long gaps)

You can do this by running the sim, computing these stats, and adjusting parameters until the distributions look plausible.

---

## 10) Where this connects to friendship prediction

Once timing looks realistic, you can start measuring features that correlate with friendship:
- reciprocity (reply likelihood)
- response time
- conversation “depth” per session
- ranking stability
- within‑cohort vs cross‑cohort interaction rates (in later phases)

---

## Appendix: Quick reading order (if you want to learn the math)
1) Barabási 2005 (arXiv preprint) — conceptual foundation for burstiness/heavy tails.
2) Holme & Saramäki 2012 (arXiv preprint) — broad context + temporal-network viewpoint.
3) Laub et al. 2015 (arXiv tutorial) — practical Hawkes math + algorithms.
4) Malmgren et al. 2008 (PNAS) — if you can access it, great for the “circadian + heterogeneity” framing.
5) Hawkes 1971 (original) — for completeness if you have access.


