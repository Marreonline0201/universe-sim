---
name: M7 Track 2 PvP Outlaw System
description: M7 Track 2 architecture — murder detection, NPC tier reactions, bounties, redemption quests, death persistence
type: project
---

M7 Track 2 PvP Outlaw System shipped 2026-03-21. Production: https://universe-sim-beryl.vercel.app (commit 030e407)

**Why:** The survival world needed a credible consequence system for PvP — murders must persist, NPCs must react proportionally, and redemption must be earnable to avoid permanent outlaw death spirals.

## Architecture

### Server-side (Railway)
- `OutlawSystem.js` — DB operations on `player_saves.murder_count`. In-memory cache (Map) keyed by userId. Bounty formula: `200 + murderCount * 150` copper. Redemption quest engine: in-memory Map keyed by questId, 10-min expiry, `tickCleanup()` called every 1s. Three quest types: escort / resource_delivery / settlement_defense. `decrementMurderCount` writes back to Neon DB.
- `PlayerRegistry.js` — added `murderCount` field. Carried in `getAll()` so WORLD_SNAPSHOT includes it for all remote players.
- `index.js` — new message handlers: `PLAYER_KILLED` (increment, re-broadcast BOUNTY_POSTED at >= 5), `BOUNTY_COLLECT` (transfer copper reward), `REDEMPTION_QUEST_REQUEST`, `REDEMPTION_QUEST_PROGRESS`. Also: `outlaw.load()` + `outlaw.migrateSchema()` on boot, `outlaw.tickCleanup()` in the 1s settlement interval.

### Message protocol (additive to M6)
- `PLAYER_KILLED {victimId}` — client → server
- `MURDER_COUNT_UPDATE {murderCount}` — server → killer only
- `BOUNTY_POSTED {playerId, username, murderCount, reward}` — server → ALL clients
- `BOUNTY_COLLECT {targetId}` — client → server (when killing a wanted player)
- `BOUNTY_COLLECTED {collectorId, targetId, reward, materialId}` — server → collector only
- `BOUNTY_COLLECT_BROADCAST {collectorName, targetName, reward}` — server → ALL clients
- `REDEMPTION_QUEST_REQUEST {settlementId}` — client → server
- `REDEMPTION_QUEST_OFFERED {questId, questType, settlementId, required, expiresAt}` — server → client
- `REDEMPTION_QUEST_DENIED {reason}` — server → client
- `REDEMPTION_QUEST_PROGRESS {questId, amount}` — client → server
- `REDEMPTION_QUEST_PROGRESS_ACK {questId, progress, required}` — server → client
- `REDEMPTION_QUEST_COMPLETE {questId, newMurderCount}` — server → client
- `REDEMPTION_QUEST_ERROR {reason}` — server → client
- `PLAYER_UPDATE` now carries `murderCount` field (10 Hz)

### Client-side
- `outlawStore.ts` — Zustand store. `wantedPlayers: Map<string, BountyEntry>`, `activeQuest: RedemptionQuest | null`, `pendingBountyNotif: BountyEntry | null`.
- `WorldSocket.ts` — handles all new messages above. WORLD_SNAPSHOT seeds `wantedPlayers` from remote player murderCounts (threshold 5, reward formula mirrored from server).
- `SceneRoot.tsx` — attack block: after creature check, scans `remotePlayers` at `stats.range + 1.5m`. On health <= 0 sends `PLAYER_KILLED` + `BOUNTY_COLLECT` if victim is wanted. NPC guard aggro block: if local murderCount >= 5 and near settlement, server NPCs within 30m deal 8 DPS (client-side simulation).
- `RemotePlayersRenderer.tsx` — `WANTED_THRESHOLD = 5`. Wanted players: red capsule, gold "WANTED: X copper" Text above name, larger pulsing skull orb. Ordinary outlaws: orange capsule.
- `SettlementHUD.tsx` — three new states: cautious tier (1-2 murders, wary banner), active quest panel (with COMPLETE TASK button), redemption request button on gates-closed panel.
- `DeathScreen.tsx` — shows "Your crimes are remembered | Murder count: N" when murderCount > 0. Death does NOT clear the record — Neon DB is source of truth.
- `NotificationSystem.tsx` — `BountyBanner` component: reads `pendingBountyNotif` from outlawStore, renders cinematic full-width gold banner for 5s on BOUNTY_POSTED.

### Key implementation patterns
1. PvP health is tracked client-side on remote player's `health` field (0..1). Damage fraction = `stats.damage / 100`. Server does not track remote player HP in real-time — kill confirmation is client-reported, server only increments murder_count.
2. Bounty reward transfer is purely server-side: only the `BOUNTY_COLLECTED` receiver gets copper — prevents double-collection.
3. Redemption quest completion is a single `REDEMPTION_QUEST_PROGRESS` with `amount = required` — simplified UX, no multi-step tracking needed client-side for M7.
4. `useWorldSocket.ts` now sends `murderCount` in every PLAYER_UPDATE so server registry stays current.

### Database
- `player_saves.murder_count INT DEFAULT 0` — already existed from M5. OutlawSystem adds no new tables.

**How to apply:** When adding further criminal justice features (e.g. bounty boards UI, wanted posters, pardon quests), follow the OutlawSystem pattern: in-memory Map + DB write on every mutation. The quest expiry cleanup pattern (tickCleanup in 1s interval) is reusable for any timed server-side state.
