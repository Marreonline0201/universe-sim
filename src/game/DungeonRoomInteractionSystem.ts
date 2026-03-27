/**
 * DungeonRoomInteractionSystem — extracted from GameLoop.ts (M71 Track A)
 *
 * Handles all dungeon room types: guardian, puzzle, shrine, boss_lair,
 * mini_boss, and spike_trap. Called once per frame when the player is underground.
 */
import * as THREE from 'three'

import { useUiStore } from '../store/uiStore'
import { usePlayerStore } from '../store/playerStore'
import { useCaveStore } from '../store/caveStore'
import { useDungeonStore } from '../store/dungeonStore'
import { Health } from '../ecs/world'
import {
  generateAllDungeonRooms,
  isDungeonRoomActive,
  activatePlate,
  clearDungeonRoom,
  resetDungeonRoom,
  nextPlateInSequence,
  CAVE_STALKER,
  CAVE_BOSS,
  dungeonState,
  triggerTrap,
  disarmTrap,
  initMiniBossRoom,
  initSpikeTrapRoom,
  getScaledBossHp,
  getScaledMiniBossHp,
} from './DungeonSystem'
import {
  spawnAnimal,
  animalRegistry,
} from '../ecs/systems/AnimalAISystem'
import { inventory } from './GameSingletons'
import { skillSystem } from './SkillSystem'
import type { PlayerController } from '../player/PlayerController'
import type { RefObject } from 'react'

export interface DungeonRoomTickContext {
  /** Player position x */
  px: number
  /** Player position y */
  py: number
  /** Player position z */
  pz: number
  /** Frame delta time in seconds */
  dt: number
  /** Player's ECS entity ID */
  entityId: number
  /** Accumulated seconds since last room respawn check */
  dungeonRoomCheckTimer: number
  /** GameStore snapshot (.inputBlocked, .gatherPrompt, .setGatherPrompt) */
  gs: {
    inputBlocked: boolean
    gatherPrompt: string | null
    setGatherPrompt: (v: string | null) => void
  }
  /** Controller ref for popInteract */
  controllerRef: RefObject<PlayerController | null>
}

export interface DungeonRoomTickResult {
  /** Updated dungeon room check timer (caller must persist to ref) */
  dungeonRoomCheckTimer: number
}

/**
 * Tick all dungeon room interactions for one frame.
 * Returns updated timer values that the caller must write back to their refs.
 */
export function tickDungeonRoomInteractions(ctx: DungeonRoomTickContext): DungeonRoomTickResult {
  const { px, py, pz, dt, entityId, gs, controllerRef } = ctx
  let dungeonRoomCheckTimer = ctx.dungeonRoomCheckTimer

  const isUG = useCaveStore.getState().underground
  if (!isUG) return { dungeonRoomCheckTimer }

  const allRooms = generateAllDungeonRooms()
  const uiSt = useUiStore.getState()
  const pPos = new THREE.Vector3(px, py, pz)

  // Periodic room-respawn check every 30s
  dungeonRoomCheckTimer += dt
  if (dungeonRoomCheckTimer > 30) {
    dungeonRoomCheckTimer = 0
    for (const room of allRooms) {
      if (room.cleared && Date.now() - room.clearedAt > room.respawnMs) {
        resetDungeonRoom(room)
      }
    }
  }

  for (const room of allRooms) {
    if (!isDungeonRoomActive(room)) continue

    const rPos = new THREE.Vector3(...room.position)
    const distToRoom = pPos.distanceTo(rPos)

    // ── Guardian room ─────────────────────────────────────────────────
    if (room.type === 'guardian') {
      tickGuardianRoom(room, rPos, distToRoom, px, py, pz, gs, controllerRef, uiSt)
    }

    // ── Puzzle room ──────────────────────────────────────────────────
    if (room.type === 'puzzle') {
      tickPuzzleRoom(room, rPos, distToRoom, px, pz, gs, controllerRef, uiSt)
    }

    // ── Shrine room ──────────────────────────────────────────────────
    if (room.type === 'shrine') {
      tickShrineRoom(room, distToRoom, gs, controllerRef, uiSt)
    }

    // ── Boss lair ────────────────────────────────────────────────────
    if (room.type === 'boss_lair') {
      tickBossLair(room, rPos, distToRoom, gs, controllerRef, uiSt)
    }

    // ── Mini-boss room ───────────────────────────────────────────────
    if (room.type === 'mini_boss') {
      tickMiniBossRoom(room, rPos, distToRoom, uiSt)
    }

    // ── Spike trap room ──────────────────────────────────────────────
    if (room.type === 'spike_trap') {
      tickSpikeTrapRoom(room, distToRoom, px, pz, entityId, gs, controllerRef, uiSt)
    }
  }

  return { dungeonRoomCheckTimer }
}

// ─── Room type handlers ──────────────────────────────────────────────────────

function tickGuardianRoom(
  room: any, rPos: THREE.Vector3, distToRoom: number,
  px: number, py: number, pz: number,
  gs: DungeonRoomTickContext['gs'],
  controllerRef: RefObject<PlayerController | null>,
  uiSt: ReturnType<typeof useUiStore.getState>,
) {
  const triggerRadius = room.radius + 2
  if (distToRoom < triggerRadius) {
    // Show warning once per room visit
    if (!room.warned) {
      room.warned = true
      uiSt.addNotification('\u26A0 Guardian Chamber \u2014 Enemies ahead', 'warning')
    }
    // Spawn guardian stalkers if not yet spawned
    if (room.guardianIds.length === 0) {
      for (let gi = 0; gi < room.guardianCount; gi++) {
        const angle = (gi / room.guardianCount) * Math.PI * 2
        const spawnX = rPos.x + Math.cos(angle) * 4
        const spawnY = rPos.y
        const spawnZ = rPos.z + Math.sin(angle) * 4
        const stalker = spawnAnimal('wolf', spawnX, spawnY, spawnZ, 9999, rPos.x, rPos.y, rPos.z)
        stalker.health = CAVE_STALKER.hp
        stalker.maxHealth = CAVE_STALKER.maxHp
        stalker.elite = true
        stalker.eliteGlowColor = '#333344'
        room.guardianIds.push(stalker.id)
      }
    }
    // Check if all guardians are dead
    if (room.guardianIds.length > 0) {
      const allDead = room.guardianIds.every((gid: number) => {
        const g = animalRegistry.get(gid)
        return !g || g.behavior === 'DEAD' || g.health <= 0
      })
      if (allDead) {
        clearDungeonRoom(room)
        uiSt.addNotification('Guardian Chamber cleared! Legendary chest unlocked.', 'discovery')
        window.dispatchEvent(new CustomEvent('dungeon-room-cleared', { detail: { type: 'guardian', roomId: room.id } }))
      }
    }
  }

  // Open legendary chest (post-clear, player within 2m)
  if (room.cleared) {
    const isUnderground = useCaveStore.getState().underground
    if (isUnderground && distToRoom < 2 && !gs.inputBlocked && gs.gatherPrompt === null) {
      gs.setGatherPrompt('[F] Open Legendary Chest')
      if (controllerRef.current?.popInteract()) {
        gs.setGatherPrompt(null)
        const lootLines = ['10x Iron Ore', '3x Velar Crystal', '+500 gold', 'Diamond Blade']
        inventory.addItem({ itemId: 0, materialId: 14, quantity: 10, quality: 0.9 }) // iron ore
        inventory.addItem({ itemId: 0, materialId: 40, quantity: 3,  quality: 1.0 }) // velar crystal
        usePlayerStore.getState().addGold(500)
        skillSystem.addXp('exploration', 100)
        uiSt.addNotification('Legendary loot obtained!', 'discovery')
        window.dispatchEvent(new CustomEvent('chest-opened', { detail: { tier: 'legendary', lootLines } }))
      }
    }
  }
}

function tickPuzzleRoom(
  room: any, rPos: THREE.Vector3, distToRoom: number,
  px: number, pz: number,
  gs: DungeonRoomTickContext['gs'],
  controllerRef: RefObject<PlayerController | null>,
  uiSt: ReturnType<typeof useUiStore.getState>,
) {
  const triggerRadius = room.radius + 4

  if (distToRoom < triggerRadius && !gs.inputBlocked) {
    if (!room.cleared) {
      const nextOrder = nextPlateInSequence(room)
      const hintLabel = `Step on plates in order: ${room.plates.map((p: any) => p.correctOrder).sort((a: number, b: number) => a - b).join('\u2192')} (next: ${nextOrder})`
      if (gs.gatherPrompt === null) gs.setGatherPrompt(hintLabel)

      // Handle puzzle reset timer
      if (room.puzzleResetAt > 0 && Date.now() > room.puzzleResetAt) {
        room.puzzleResetAt = 0
        uiSt.addNotification('Puzzle reset \u2014 wrong order!', 'warning')
      }

      // Check if player is stepping on a plate (within 1.2m of any plate)
      for (let pi = 0; pi < room.plates.length; pi++) {
        const plate = room.plates[pi]
        if (plate.activated) continue
        const plateDx = (rPos.x + plate.offsetX) - px
        const plateDz = (rPos.z + plate.offsetZ) - pz
        const plateDist = Math.sqrt(plateDx * plateDx + plateDz * plateDz)
        if (plateDist < 1.2) {
          const result = activatePlate(room, pi)
          if (result === 'wrong') {
            uiSt.addNotification('Wrong plate! Puzzle resets in 3s\u2026', 'warning')
          } else if (result === 'correct') {
            uiSt.addNotification(`Plate ${plate.correctOrder} activated!`, 'info')
          } else if (result === 'solved') {
            clearDungeonRoom(room)
            uiSt.addNotification('Puzzle solved! Chest unlocked!', 'discovery')
            skillSystem.addXp('exploration', 80)
            inventory.addItem({ itemId: 0, materialId: 14, quantity: 5, quality: 0.85 })
            usePlayerStore.getState().addGold(100)
            window.dispatchEvent(new CustomEvent('dungeon-room-cleared', { detail: { type: 'puzzle', roomId: room.id } }))
          }
          break
        }
      }
    }
  }
}

function tickShrineRoom(
  room: any, distToRoom: number,
  gs: DungeonRoomTickContext['gs'],
  controllerRef: RefObject<PlayerController | null>,
  uiSt: ReturnType<typeof useUiStore.getState>,
) {
  if (distToRoom < 3 && !gs.inputBlocked) {
    if (room.shrineUsed) {
      if (gs.gatherPrompt === null) gs.setGatherPrompt('[Shrine dimmed \u2014 returns in 20 min]')
    } else {
      if (gs.gatherPrompt === null) gs.setGatherPrompt('[E] Make offering: 5 Iron Ore \u2192 Skill XP Boost')
      if (controllerRef.current?.popInteract()) {
        // Check iron ore (MAT.IRON_ORE = 14)
        let ironCount = 0
        const ironSlots: number[] = []
        for (let slot = 0; slot < 40; slot++) {
          const s = inventory.getSlot(slot)
          if (s && s.itemId === 0 && s.materialId === 14) {
            ironCount += s.quantity
            ironSlots.push(slot)
          }
        }
        if (ironCount >= 5) {
          // Consume 5 iron ore
          let toRemove = 5
          for (const slotIdx of ironSlots) {
            if (toRemove <= 0) break
            const s = inventory.getSlot(slotIdx)
            if (!s) continue
            const take = Math.min(toRemove, s.quantity)
            inventory.removeItem(slotIdx, take)
            toRemove -= take
          }
          // Grant +200 XP to a random non-maxed skill
          const skills: Array<'gathering' | 'crafting' | 'combat' | 'survival' | 'exploration' | 'smithing' | 'husbandry'> =
            ['gathering', 'crafting', 'combat', 'survival', 'exploration', 'smithing', 'husbandry']
          const chosen = skills[Math.floor(Math.random() * skills.length)]
          skillSystem.addXp(chosen, 200)
          room.shrineUsed = true
          room.shrineUsedAt = Date.now()
          gs.setGatherPrompt(null)
          uiSt.addNotification(`The shrine glows... +200 ${chosen.charAt(0).toUpperCase() + chosen.slice(1)} XP`, 'discovery')
          window.dispatchEvent(new CustomEvent('shrine-used', { detail: { skill: chosen, roomId: room.id } }))
        } else {
          uiSt.addNotification(`Need 5 Iron Ore \u2014 you have ${ironCount}`, 'warning')
          gs.setGatherPrompt(null)
        }
      }
    }
  }
}

function tickBossLair(
  room: any, rPos: THREE.Vector3, distToRoom: number,
  gs: DungeonRoomTickContext['gs'],
  controllerRef: RefObject<PlayerController | null>,
  uiSt: ReturnType<typeof useUiStore.getState>,
) {
  if (distToRoom < room.radius + 4) {
    if (room.bossAlive) {
      // Spawn boss entity (wolf-body, max stats)
      if (room.bossEntityId < 0) {
        const scaledBossHp = getScaledBossHp()
        const boss = spawnAnimal('wolf', rPos.x, rPos.y, rPos.z, 0, rPos.x, rPos.y, rPos.z)
        boss.health = scaledBossHp
        boss.maxHealth = scaledBossHp
        boss.elite = true
        boss.eliteGlowColor = '#660000'
        room.bossEntityId = boss.id
        room.bossHp = scaledBossHp
        room.bossMaxHp = scaledBossHp
        uiSt.addNotification(`\u26A0 ${CAVE_BOSS.name} awakens! (Floor ${useDungeonStore.getState().currentFloor})`, 'warning')
      }
      // Sync hp from entity
      const bossEntity = animalRegistry.get(room.bossEntityId)
      if (bossEntity) {
        room.bossHp = bossEntity.health
      }
      if (!bossEntity || bossEntity.behavior === 'DEAD' || (bossEntity && bossEntity.health <= 0)) {
        // Boss defeated
        room.bossAlive = false
        clearDungeonRoom(room)
        // Drop unique loot
        inventory.addItem({ itemId: 0, materialId: 14, quantity: 5,  quality: 1.0 }) // iron ore
        inventory.addItem({ itemId: 0, materialId: 40, quantity: 3,  quality: 1.0 }) // velar crystal
        inventory.addItem({ itemId: 0, materialId: 5,  quantity: 8,  quality: 1.0 }) // coal
        usePlayerStore.getState().addGold(150)
        skillSystem.addXp('combat', 200)
        skillSystem.addXp('exploration', 100)
        uiSt.addNotification(`${CAVE_BOSS.name} defeated! Rare cave loot dropped!`, 'discovery')
        window.dispatchEvent(new CustomEvent('dungeon-room-cleared', { detail: { type: 'boss_lair', roomId: room.id } }))
        // M47 Track C: sync floor store after boss defeat
        useDungeonStore.getState().sync()
      }
    } else if (room.cleared && distToRoom < 2 && gs.gatherPrompt === null) {
      gs.setGatherPrompt('[F] Collect boss loot')
    }
  }
}

function tickMiniBossRoom(
  room: any, rPos: THREE.Vector3, distToRoom: number,
  uiSt: ReturnType<typeof useUiStore.getState>,
) {
  if (distToRoom < room.radius + 4) {
    if (room.miniBossAlive) {
      // Spawn mini-boss entity if not yet spawned
      if (room.miniBossEntityId < 0) {
        const scaledMbHp = getScaledMiniBossHp()
        room.miniBossMaxHp = scaledMbHp
        room.miniBossHp = scaledMbHp
        const mb = spawnAnimal('wolf', rPos.x, rPos.y, rPos.z, 0, rPos.x, rPos.y, rPos.z)
        mb.health = scaledMbHp
        mb.maxHealth = scaledMbHp
        mb.elite = true
        mb.eliteGlowColor = '#9933cc'
        room.miniBossEntityId = mb.id
        room.miniBossHp = room.miniBossMaxHp
        // Sync into dungeonState singleton for DungeonRenderer
        initMiniBossRoom(room)
        useDungeonStore.getState().sync()
        uiSt.addNotification(`\u26A0 ${room.miniBossName} awakens!`, 'warning')
      }
      // Sync HP from entity
      const mbEntity = animalRegistry.get(room.miniBossEntityId)
      if (mbEntity) {
        room.miniBossHp = mbEntity.health
        dungeonState.miniBossHp = mbEntity.health
        useDungeonStore.getState().sync()
      }
      if (!mbEntity || mbEntity.behavior === 'DEAD' || mbEntity.health <= 0) {
        // Mini-boss defeated
        const gold = 50 + Math.floor(Math.random() * 51) // 50-100
        room.miniBossAlive = false
        clearDungeonRoom(room)
        // Drop rare item + gold
        inventory.addItem({ itemId: 0, materialId: 40, quantity: 1, quality: 1.0 }) // velar crystal (rare)
        usePlayerStore.getState().addGold(gold)
        skillSystem.addXp('combat', 150)
        // Sync store
        dungeonState.miniBossAlive = false
        useDungeonStore.getState().sync()
        uiSt.addNotification(`${room.miniBossName} defeated! +${gold} gold`, 'discovery')
        window.dispatchEvent(new CustomEvent('dungeon-boss-defeated', {
          detail: { name: room.miniBossName, gold },
        }))
      }
    }
  }
}

function tickSpikeTrapRoom(
  room: any, distToRoom: number,
  px: number, pz: number,
  entityId: number,
  gs: DungeonRoomTickContext['gs'],
  controllerRef: RefObject<PlayerController | null>,
  uiSt: ReturnType<typeof useUiStore.getState>,
) {
  if (distToRoom < room.radius + 4) {
    if (!room.cleared) {
      // Initialise dungeon trap state on first entry
      if (dungeonState.activeTraps.length === 0 && room.traps.length > 0) {
        initSpikeTrapRoom(room)
        useDungeonStore.getState().sync()
      }

      // Check each trap for proximity trigger and E-key disarm
      for (const trap of room.traps) {
        if (trap.disarmed) continue
        const tdx = trap.x - px
        const tdz = trap.z - pz
        const trapDist = Math.sqrt(tdx * tdx + tdz * tdz)

        // Trigger: player steps on trap (within 0.6m)
        if (trapDist < 0.6) {
          const dmg = triggerTrap(trap.id, { current: Health.current[entityId], max: Health.max[entityId] })
          if (dmg > 0) {
            Health.current[entityId] = Math.max(0, Health.current[entityId] - dmg)
            room.trapTriggerCount++
            // Keep room trap list in sync with dungeonState
            const dsTrap = dungeonState.activeTraps.find((t: any) => t.id === trap.id)
            if (dsTrap) dsTrap.lastTriggered = Date.now()
            trap.lastTriggered = Date.now()
            useDungeonStore.getState().sync()
            uiSt.addNotification(`Spike trap! -${dmg} HP`, 'warning')
          }
        }

        // Disarm: E key within 1.5m
        if (trapDist < 1.5 && gs.gatherPrompt === null) {
          gs.setGatherPrompt('[E] Disarm spike trap')
          if (controllerRef.current?.popInteract()) {
            disarmTrap(trap.id)
            trap.disarmed = true
            const dsTrap = dungeonState.activeTraps.find((t: any) => t.id === trap.id)
            if (dsTrap) dsTrap.disarmed = true
            useDungeonStore.getState().sync()
            gs.setGatherPrompt(null)
            skillSystem.addXp('exploration', 20)
            uiSt.addNotification('Spike trap disarmed!', 'info')
          }
        }
      }

      // Room clears when all traps disarmed or 10 total triggers
      const allDisarmed = room.traps.every((t: any) => t.disarmed)
      if (allDisarmed || room.trapTriggerCount >= 10) {
        clearDungeonRoom(room)
        dungeonState.activeTraps = []
        useDungeonStore.getState().sync()
        uiSt.addNotification('Spike trap room cleared!', 'discovery')
        window.dispatchEvent(new CustomEvent('dungeon-room-cleared', { detail: { type: 'spike_trap', roomId: room.id } }))
      }
    }
  }
}
