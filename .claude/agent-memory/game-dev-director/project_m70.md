---
name: M70 GameLoop Scheduler Extraction
description: M70 DONE — GameLoopScheduler declarative periodic-tick system, 18 subsystem ticks extracted from GameLoop, error auto-disable, linter fixes
type: project
---

M70 Track A: GameLoopScheduler extraction shipped (commit 08024fd).

**What was done:**
- New `src/game/GameLoopScheduler.ts`: declarative periodic-tick system with per-task error tracking and auto-disable after 5 consecutive failures
- New `src/game/GameLoopPeriodicTasks.ts`: registers 18 subsystem ticks that were previously 20+ useRef timer declarations
- GameLoop reduced from 3727 to 3539 lines (-188 lines)
- Extracted systems: resource respawn, NPC emotions, settlement relations, trade network, expeditions, NPC schedules, weather events, market prices, trade routes, achievement milestones, pet XP, title progression, world boss, weather forecast, merchant guild, bounty board, settlement economy, quest board, faction wars, world event scheduler

**Key architectural decisions:**
- Systems that need per-frame `dt` (sailing, combat, raft, etc.) stay in GameLoop useFrame
- Systems that need player position (exploration, discovery) stay in GameLoop
- Seasonal events stay in GameLoop (needs dt for season progress accumulation)
- All simSeconds-based periodic ticks moved to scheduler

**What remains for future M71+:**
- GameLoop is still 3539 lines — dungeon room interactions (lines ~1154-1486) are next extraction candidate
- HUD.tsx at 2783 lines — sub-components before line 2100 could be extracted to separate files
- Index bundle still 4.1MB — game system lazy-loading would help
- 178 useStore.getState() calls per frame in GameLoop (75 uiStore, 52 playerStore) — caching optimization deferred due to mutation risk
- TradeRouteSystem.ts vs TradingRouteSystem.ts confirmed as separate systems (M56 NPC routes vs M49 player routes), not duplicates

**Why:** GameLoop monolith was the top maintenance and performance risk. Timer-based ticks were the lowest-risk extraction target.

**How to apply:** When adding new periodic systems, register in GameLoopPeriodicTasks.ts instead of adding another useRef timer in GameLoop. Use the scheduler's `getStatus()` for debugging task failures.
