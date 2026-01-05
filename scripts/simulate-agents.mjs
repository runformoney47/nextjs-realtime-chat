/**
 * Local agent simulation v1 (no API calls).
 *
 * Outputs:
 * - sim_out/<runId>/events.jsonl
 * - sim_out/<runId>/ground_truth.json
 * - sim_out/<runId>/manifest.json
 *
 * Run:
 *   npm run sim:agents
 *
 * Notes:
 * - This script is intentionally dependency-free.
 * - Deterministic given a seed.
 */

import fs from 'node:fs'
import path from 'node:path'

// -----------------------------
// Config (v1 defaults)
// -----------------------------
const CONFIG = {
  cohorts: 5,
  cohortSize: 20,
  groupSize: 5,
  days: 14,
  tickMinutes: 5,
  // messaging
  baseMsgRatePerHour: 0.6, // scaled by energy ∈ [0,1]
  maxBurstBonus: 1.8, // extra rate when responding to recent messages
  // ranking
  rankingAtMinute: 22 * 60, // submit rankings near end of day (22:00)
  // opinions (daily digest)
  dailyOpinionAtMinute: 22 * 60, // align with rankings by default
  // Opinion vector dimensions are stored in [-1, +1]
  opinionInit: {
    warmth: 0,
    respect: 0,
    humor: 0,
    trust: 0,
    interest_overlap: 0,
  },
  opinionLearningRate: 0.12, // fallback deterministic update strength
  opinionNoise: 0.08, // fallback randomness for non-deterministic relationships
  affinityWeights: {
    warmth: 0.3,
    respect: 0.25,
    humor: 0.15,
    trust: 0.15,
    interest_overlap: 0.15,
  },
  // reproducibility
  seed: 1337,
}

// -----------------------------
// Deterministic RNG
// -----------------------------
function mulberry32(seed) {
  let t = seed >>> 0
  return function rand() {
    t += 0x6d2b79f5
    let x = Math.imul(t ^ (t >>> 15), 1 | t)
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

function randInt(rand, minInclusive, maxInclusive) {
  const r = rand()
  return minInclusive + Math.floor(r * (maxInclusive - minInclusive + 1))
}

function randChoice(rand, arr) {
  return arr[Math.floor(rand() * arr.length)]
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x))
}

function clamp11(x) {
  return Math.max(-1, Math.min(1, x))
}

function addVec(a, b) {
  const out = {}
  for (const k of Object.keys(a)) {
    out[k] = (a[k] ?? 0) + (b[k] ?? 0)
  }
  return out
}

function clampVec(a) {
  const out = {}
  for (const k of Object.keys(a)) {
    out[k] = clamp11(a[k] ?? 0)
  }
  return out
}

function affinityScalar(vec, weights) {
  let sum = 0
  for (const [k, w] of Object.entries(weights)) {
    sum += (vec[k] ?? 0) * w
  }
  return clamp11(sum)
}

function shuffleInPlace(rand, arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// -----------------------------
// Circadian energy model
// -----------------------------
/**
 * Returns energy ∈ [0,1].
 * A simple shifted cosine curve with baseline + small noise.
 */
function circadianEnergy(rand, minuteOfDay, chronotypeShiftHours, baseActivity) {
  const t = (minuteOfDay / 60 + chronotypeShiftHours) * (2 * Math.PI / 24)
  // Cosine peak around midday; shift moves peak earlier/later.
  const circ = 0.5 + 0.5 * Math.cos(t - Math.PI) // roughly low at night, high daytime
  const noise = (rand() - 0.5) * 0.08
  const energy = 0.15 + 0.75 * circ + 0.2 * baseActivity + noise
  return clamp01(energy)
}

// -----------------------------
// Agent + cohort generation
// -----------------------------
function buildAgents(rand, cohorts, cohortSize) {
  const agents = []
  for (let c = 0; c < cohorts; c += 1) {
    const cohortId = `c${c}`
    for (let i = 0; i < cohortSize; i += 1) {
      const agentId = `a_${cohortId}_${String(i).padStart(2, '0')}`
      // chronotype: [-4, +4] hours
      const chronotypeShiftHours = (rand() * 8) - 4
      const baseActivity = rand() // [0,1]
      const responsiveness = 0.2 + 0.8 * rand() // [0.2,1.0]
      agents.push({
        agentId,
        cohortId,
        chronotypeShiftHours,
        baseActivity,
        responsiveness,
      })
    }
  }
  return agents
}

/**
 * Latent affinity matrix per cohort (symmetric).
 * Used only to drive rankings + mild message bias later.
 */
function buildAffinity(rand, cohortAgents) {
  const ids = cohortAgents.map((a) => a.agentId)
  const matrix = new Map()
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = ids[i]
      const b = ids[j]
      // Skew toward moderate affinities with occasional strong ties.
      const r = rand()
      const affinity = clamp01(Math.pow(r, 0.6)) // more mass near 1 than uniform
      matrix.set(`${a}::${b}`, affinity)
      matrix.set(`${b}::${a}`, affinity)
    }
  }
  return matrix
}

function affinityOf(matrix, a, b) {
  if (a === b) return 1
  return matrix.get(`${a}::${b}`) ?? 0.5
}

// -----------------------------
// Grouping (daily)
// -----------------------------
function buildDailyGroups(rand, cohortAgents, groupSize) {
  const shuffled = shuffleInPlace(rand, [...cohortAgents])
  const groups = []
  for (let i = 0; i < shuffled.length; i += groupSize) {
    groups.push(shuffled.slice(i, i + groupSize))
  }
  return groups
}

// -----------------------------
// Event logging
// -----------------------------
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true })
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n', 'utf8')
}

function appendJsonl(fd, obj) {
  fs.writeSync(fd, JSON.stringify(obj) + '\n')
}

// -----------------------------
// Simulation
// -----------------------------
function runSimulation() {
  const rand = mulberry32(CONFIG.seed)
  const runId = `run_${new Date().toISOString().replace(/[:.]/g, '-')}_seed_${CONFIG.seed}`
  const outDir = path.join(process.cwd(), 'sim_out', runId)
  ensureDir(outDir)

  const agents = buildAgents(rand, CONFIG.cohorts, CONFIG.cohortSize)

  // Cohort lookup
  const cohorts = new Map()
  for (const a of agents) {
    const list = cohorts.get(a.cohortId) ?? []
    list.push(a)
    cohorts.set(a.cohortId, list)
  }

  // Latent affinity per cohort
  const affinityByCohort = new Map()
  for (const [cohortId, cohortAgents] of cohorts.entries()) {
    affinityByCohort.set(cohortId, buildAffinity(rand, cohortAgents))
  }

  // Ground truth (v1): same cohort = positive
  const cohortMembership = agents.map((a) => ({ agent_id: a.agentId, cohort_id: a.cohortId }))
  const groundTruth = {
    label_definition: 'v1_same_cohort_is_friend',
    cohorts: CONFIG.cohorts,
    cohort_size: CONFIG.cohortSize,
    agents: cohortMembership,
  }

  const manifest = {
    run_id: runId,
    created_at: new Date().toISOString(),
    config: CONFIG,
    notes: [
      'Local-only simulation; no API calls; event log is the dataset source of truth.',
      'Messages are template strings; rankings derived from latent affinity matrix.',
    ],
  }

  writeJson(path.join(outDir, 'ground_truth.json'), groundTruth)
  writeJson(path.join(outDir, 'manifest.json'), manifest)

  const eventsPath = path.join(outDir, 'events.jsonl')
  const fd = fs.openSync(eventsPath, 'w')

  const tickCountPerDay = Math.floor((24 * 60) / CONFIG.tickMinutes)
  const msgTemplates = [
    'quick check-in',
    'what’s up?',
    'lol',
    'interesting',
    'tell me more',
    'agree',
    'disagree',
    'busy rn',
    'free later',
    '😂',
  ]

  // Opinion state: Map "i::j" -> opinion vector in [-1, +1]
  const opinion = new Map()
  for (const a of agents) {
    for (const b of agents) {
      if (a.agentId === b.agentId) continue
      opinion.set(`${a.agentId}::${b.agentId}`, { ...CONFIG.opinionInit })
    }
  }

  // Track “recent message activity” per agent per day to drive bursts
  const lastHeardMinute = new Map() // key: agentId -> minuteOfDay

  // Track per-day interaction summary per agent (lightweight, for digest)
  // key: agentId -> { receivedFrom: Map<otherId,count>, sentToGroup: number }
  let dailyStats = new Map()

  for (let day = 0; day < CONFIG.days; day += 1) {
    dailyStats = new Map()
    // Per-day group assignments
    const groupAssignments = new Map() // agentId -> groupId
    const groupMembersById = new Map() // groupId -> agentId[]

    for (const [cohortId, cohortAgents] of cohorts.entries()) {
      const groups = buildDailyGroups(rand, cohortAgents, CONFIG.groupSize)
      for (let gi = 0; gi < groups.length; gi += 1) {
        const group = groups[gi]
        const groupId = `cohort_${cohortId}/day_${day}/group_${gi}`
        groupMembersById.set(groupId, group.map((a) => a.agentId))
        for (const agent of group) {
          groupAssignments.set(agent.agentId, groupId)
        }
        appendJsonl(fd, {
          run_id: runId,
          ts_sim: { day, minute: 0 },
          event_type: 'group_formed',
          cohort_id: cohortId,
          group_id: groupId,
          agent_id: null,
          payload: {
            members: group.map((a) => a.agentId),
          },
        })
      }
    }

    // Simulate the day in ticks
    for (let tick = 0; tick < tickCountPerDay; tick += 1) {
      const minute = tick * CONFIG.tickMinutes

      for (const agent of agents) {
        const groupId = groupAssignments.get(agent.agentId)
        if (!groupId) continue

        const energy = circadianEnergy(
          rand,
          minute,
          agent.chronotypeShiftHours,
          agent.baseActivity,
        )

        // Log energy occasionally (every hour) for later debugging/feature work
        if (minute % 60 === 0) {
          appendJsonl(fd, {
            run_id: runId,
            ts_sim: { day, minute },
            event_type: 'energy_sample',
            cohort_id: agent.cohortId,
            group_id: groupId,
            agent_id: agent.agentId,
            payload: { energy },
          })
        }

        // Burst bonus if agent recently received a message (within 30 minutes)
        const lastHeard = lastHeardMinute.get(agent.agentId)
        const heardRecently = typeof lastHeard === 'number' && minute - lastHeard <= 30
        const burst = heardRecently ? (1 + agent.responsiveness * CONFIG.maxBurstBonus) : 1

        // Poisson-ish per tick: p ≈ rate_per_tick
        const ratePerHour = CONFIG.baseMsgRatePerHour * energy * burst
        const ratePerTick = (ratePerHour / 60) * CONFIG.tickMinutes
        const willSend = rand() < ratePerTick

        if (willSend) {
          const msg = randChoice(rand, msgTemplates)
          const messageId = `m_${runId}_${day}_${minute}_${agent.agentId}_${randInt(rand, 0, 1e9)}`

          appendJsonl(fd, {
            run_id: runId,
            ts_sim: { day, minute },
            event_type: 'message_sent',
            cohort_id: agent.cohortId,
            group_id: groupId,
            agent_id: agent.agentId,
            payload: {
              message_id: messageId,
              text: msg,
            },
          })

          // Update daily stats for sender
          {
            const s = dailyStats.get(agent.agentId) ?? {
              receivedFrom: new Map(),
              sentCount: 0,
            }
            s.sentCount += 1
            dailyStats.set(agent.agentId, s)
          }

          // Everyone else in the group "hears" this at the same minute (MVP).
          // We approximate by bumping lastHeard for cohort-mates assigned to the same group.
          // (We keep it simple to avoid O(n^2) scans across all agents.)
          // This is slightly inefficient but fine at 100 agents.
          for (const other of agents) {
            if (other.agentId === agent.agentId) continue
            if (groupAssignments.get(other.agentId) === groupId) {
              lastHeardMinute.set(other.agentId, minute)
              // Track received-from counts for daily digest
              const r = dailyStats.get(other.agentId) ?? {
                receivedFrom: new Map(),
                sentCount: 0,
              }
              r.receivedFrom.set(
                agent.agentId,
                (r.receivedFrom.get(agent.agentId) ?? 0) + 1,
              )
              dailyStats.set(other.agentId, r)
            }
          }
        }
      }

      // Rankings at a fixed time
      if (minute === CONFIG.dailyOpinionAtMinute) {
        // -----------------------------
        // Daily “digest” per agent (LLM-ready request + deterministic fallback update)
        // -----------------------------
        for (const [cohortId, cohortAgents] of cohorts.entries()) {
          const groups = new Map()
          for (const agent of cohortAgents) {
            const gid = groupAssignments.get(agent.agentId)
            if (!gid) continue
            const list = groups.get(gid) ?? []
            list.push(agent)
            groups.set(gid, list)
          }

          for (const [groupId, members] of groups.entries()) {
            const memberIds = members.map((m) => m.agentId)

            for (const agent of members) {
              const stats = dailyStats.get(agent.agentId) ?? {
                receivedFrom: new Map(),
                sentCount: 0,
              }

              // Build a compact “digest request” payload that can be sent to an LLM later
              const others = memberIds.filter((id) => id !== agent.agentId)
              const currentOpinions = Object.fromEntries(
                others.map((otherId) => [
                  otherId,
                  opinion.get(`${agent.agentId}::${otherId}`) ?? { ...CONFIG.opinionInit },
                ]),
              )
              const receivedCounts = Object.fromEntries(
                others.map((otherId) => [
                  otherId,
                  stats.receivedFrom.get(otherId) ?? 0,
                ]),
              )

              appendJsonl(fd, {
                run_id: runId,
                ts_sim: { day, minute },
                event_type: 'daily_digest_request',
                cohort_id: cohortId,
                group_id: groupId,
                agent_id: agent.agentId,
                payload: {
                  persona: {
                    chronotypeShiftHours: Number(agent.chronotypeShiftHours.toFixed(2)),
                    baseActivity: Number(agent.baseActivity.toFixed(3)),
                    responsiveness: Number(agent.responsiveness.toFixed(3)),
                  },
                  group_members: memberIds,
                  day_stats: {
                    sentCount: stats.sentCount,
                    receivedFrom: receivedCounts,
                  },
                  currentOpinions,
                  instruction:
                    'Update your affinity vector for each other group member based on today’s interaction summary, then produce a ranking of the other members (best connection first). Return JSON only. Vector dims: warmth,respect,humor,trust,interest_overlap. Each dim must be in [-1,1].',
                },
              })

              // Deterministic fallback update rule (behavior-only):
              // - more incoming messages from someone -> opinion nudges upward
              // - small noise prevents ties and keeps dynamics moving
              for (const otherId of others) {
                const key = `${agent.agentId}::${otherId}`
                const before = opinion.get(key) ?? { ...CONFIG.opinionInit }
                const received = stats.receivedFrom.get(otherId) ?? 0
                const signal = clamp01(received / 6) * 2 - 1 // map [0..6+] to [-1..+1]
                const noise = (rand() - 0.5) * CONFIG.opinionNoise

                // Fallback behavior-only delta:
                // - receiving messages nudges warmth/respect/trust upward
                // - humor/interest_overlap drift slowly until content is modeled
                const delta = {
                  warmth: CONFIG.opinionLearningRate * (signal + noise) * 0.6,
                  respect: CONFIG.opinionLearningRate * (signal + noise) * 0.5,
                  trust: CONFIG.opinionLearningRate * (signal + noise) * 0.4,
                  humor: CONFIG.opinionLearningRate * noise * 0.2,
                  interest_overlap: CONFIG.opinionLearningRate * noise * 0.2,
                }

                const after = clampVec(addVec(before, delta))
                opinion.set(key, after)

                appendJsonl(fd, {
                  run_id: runId,
                  ts_sim: { day, minute },
                  event_type: 'opinion_update_fallback',
                  cohort_id: cohortId,
                  group_id: groupId,
                  agent_id: agent.agentId,
                  payload: {
                    other_id: otherId,
                    before,
                    after,
                    receivedCount: received,
                  },
                })
              }

              // Emit ranking based on updated opinions (fallback)
              const ranked = others
                .map((otherId) => ({
                  agent_id: otherId,
                  score: affinityScalar(
                    opinion.get(`${agent.agentId}::${otherId}`) ?? { ...CONFIG.opinionInit },
                    CONFIG.affinityWeights,
                  ),
                }))
                .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                .map((r, idx) => ({
                  agent_id: r.agent_id,
                  position: idx,
                  score: Number((r.score ?? 0).toFixed(4)),
                }))

              appendJsonl(fd, {
                run_id: runId,
                ts_sim: { day, minute },
                event_type: 'ranking_submitted',
                cohort_id: cohortId,
                group_id: groupId,
                agent_id: agent.agentId,
                payload: { ranked, source: 'fallback_from_daily_digest' },
              })
            }
          }
        }
      }

      // Back-compat: keep old ranking event type timing hook if configured differently
      if (minute === CONFIG.rankingAtMinute && CONFIG.rankingAtMinute !== CONFIG.dailyOpinionAtMinute) {
        for (const [cohortId, cohortAgents] of cohorts.entries()) {
          const matrix = affinityByCohort.get(cohortId)
          if (!matrix) continue

          // group -> members
          const groups = new Map()
          for (const agent of cohortAgents) {
            const gid = groupAssignments.get(agent.agentId)
            if (!gid) continue
            const list = groups.get(gid) ?? []
            list.push(agent)
            groups.set(gid, list)
          }

          for (const [groupId, members] of groups.entries()) {
            for (const rater of members) {
              const others = members.filter((m) => m.agentId !== rater.agentId)
              // Sample ordering by sorting noisy affinity (higher affinity = ranked higher)
              const scored = others.map((o) => ({
                agentId: o.agentId,
                score:
                  (matrix ? affinityOf(matrix, rater.agentId, o.agentId) : 0.5) +
                  (rand() - 0.5) * 0.15,
              }))
              scored.sort((a, b) => b.score - a.score)

              appendJsonl(fd, {
                run_id: runId,
                ts_sim: { day, minute },
                event_type: 'ranking_submitted',
                cohort_id: cohortId,
                group_id: groupId,
                agent_id: rater.agentId,
                payload: {
                  ranked: scored.map((s, idx) => ({
                    agent_id: s.agentId,
                    position: idx,
                    score: Number(s.score.toFixed(4)),
                  })),
                },
              })
            }
          }
        }
      }
    }
  }

  fs.closeSync(fd)

  console.log(`[sim] wrote: ${eventsPath}`)
  console.log(`[sim] wrote: ${path.join(outDir, 'ground_truth.json')}`)
  console.log(`[sim] wrote: ${path.join(outDir, 'manifest.json')}`)
  console.log(`[sim] done run_id=${runId}`)
}

runSimulation()


