// ── VelarDiplomacySystem.ts ───────────────────────────────────────────────────
// M15 Track B: Trade and knowledge exchange with the Velar civilization.
//
// Three interaction modes:
//   TRADE — exchange Earth materials for Velar exotic components
//   LEARN — Velar teaches the 'velar_fabrication' knowledge branch (one-time)
//   ASK   — lore reveal + journal entry about Velar purpose
//
// Trade is server-authoritative: client sends VELAR_TRADE_REQUEST, server
// validates inventory, sends VELAR_TRADE_COMPLETED back with result.

import { inventory, techTree, journal } from './GameSingletons'
import { MAT, ITEM } from '../player/Inventory'
import { useUiStore } from '../store/uiStore'
import { getWorldSocket } from '../net/useWorldSocket'

// ── Trade table ───────────────────────────────────────────────────────────────
// Each entry: { id, inputMat, inputQty, outputType, outputId, outputQty, label }

export interface VelarTrade {
  id:         string
  label:      string
  inputMat:   number      // materialId from MAT
  inputQty:   number
  outputMat?: number      // if producing a material
  outputItem?: number     // if producing an item
  outputQty:  number
  description: string
}

export const VELAR_TRADES: VelarTrade[] = [
  {
    id:          'steel_for_alloy',
    label:       '10× Steel → 1× Velar Alloy',
    inputMat:    MAT.STEEL_INGOT,
    inputQty:    10,
    outputMat:   MAT.VELAR_ALLOY,
    outputQty:   1,
    description: 'Steel is a curiosity to the Velar — they transmute it into a crystalline alloy with twice the tensile strength.',
  },
  {
    id:          'circuits_for_core',
    label:       '5× Circuit Board + 2× Gold → 1× Quantum Core',
    inputMat:    MAT.CIRCUIT_BOARD,
    inputQty:    5,
    outputMat:   MAT.QUANTUM_CORE,
    outputQty:   1,
    description: 'Your primitive electronic components amuse them. They recrystallize the silicon lattice at quantum resolution.',
  },
  {
    id:          'crystal_beacon',
    label:       '1× Velar Crystal + 20× Hydrogen → 1× Velar Beacon',
    inputMat:    MAT.VELAR_CRYSTAL,
    inputQty:    1,
    outputItem:  ITEM.VELAR_BEACON,
    outputQty:   1,
    description: 'A resonance marker that broadcasts your home universe coordinates across the gateway network.',
  },
]

// ── Knowledge unlock ──────────────────────────────────────────────────────────

let _fabricationLearned = false

export function attemptLearnVelarFabrication(): boolean {
  if (_fabricationLearned || techTree.isResearched('velar_fabrication')) {
    useUiStore.getState().addNotification(
      'You have already learned Velar Fabrication techniques.',
      'info'
    )
    return false
  }

  techTree.markResearched('velar_fabrication')
  // Discover all Velar-tier recipes
  for (const recipeId of [106, 107, 108, 109, 110]) {
    inventory.discoverRecipe(recipeId)
  }
  _fabricationLearned = true

  useUiStore.getState().addNotification(
    'Velar Fabrication knowledge gained! Recipes 106–110 unlocked. Build a Velar Fabricator to access them.',
    'discovery'
  )

  try {
    getWorldSocket()?.send({ type: 'VELAR_KNOWLEDGE_SHARED' })
  } catch {}

  return true
}

// ── Trade execution ───────────────────────────────────────────────────────────

export function attemptVelarTrade(trade: VelarTrade): boolean {
  // Validate input materials
  let available = 0
  let goldAvail  = 0

  for (let i = 0; i < inventory.slotCount; i++) {
    const sl = inventory.getSlot(i)
    if (!sl) continue
    if (sl.materialId === trade.inputMat) available += sl.quantity
    if (trade.id === 'circuits_for_core' && sl.materialId === MAT.GOLD) goldAvail += sl.quantity
  }

  if (available < trade.inputQty) {
    useUiStore.getState().addNotification(
      `Not enough materials for this trade. Need ${trade.inputQty}× ${trade.label.split('×')[1]?.split('→')[0]?.trim() ?? 'input'}.`,
      'warning'
    )
    return false
  }

  // Gold check for circuits_for_core trade
  if (trade.id === 'circuits_for_core' && goldAvail < 2) {
    useUiStore.getState().addNotification('Need 2× Gold for this trade.', 'warning')
    return false
  }

  // Consume inputs
  let remaining = trade.inputQty
  for (let i = 0; i < inventory.slotCount && remaining > 0; i++) {
    const sl = inventory.getSlot(i)
    if (!sl || sl.materialId !== trade.inputMat) continue
    const take = Math.min(sl.quantity, remaining)
    inventory.removeItem(i, take)
    remaining -= take
  }

  // Consume gold for circuits_for_core
  if (trade.id === 'circuits_for_core') {
    let goldRem = 2
    for (let i = 0; i < inventory.slotCount && goldRem > 0; i++) {
      const sl = inventory.getSlot(i)
      if (!sl || sl.materialId !== MAT.GOLD) continue
      const take = Math.min(sl.quantity, goldRem)
      inventory.removeItem(i, take)
      goldRem -= take
    }
  }

  // Grant output
  if (trade.outputMat !== undefined) {
    inventory.addItem({ itemId: 0, materialId: trade.outputMat, quantity: trade.outputQty, quality: 1.0 })
  } else if (trade.outputItem !== undefined) {
    inventory.addItem({ itemId: trade.outputItem, materialId: 0, quantity: trade.outputQty, quality: 1.0 })
  }

  useUiStore.getState().addNotification(`Trade complete: received ${trade.outputQty}× ${trade.label.split('→')[1]?.trim() ?? 'item'}.`, 'discovery')

  try {
    getWorldSocket()?.send({ type: 'VELAR_TRADE_COMPLETED', tradeId: trade.id })
  } catch {}

  return true
}

// ── Lore reveal ───────────────────────────────────────────────────────────────

const VELAR_PURPOSE_LORE = `The Velar did not evolve on this world. They spread it — seeding life across
the galaxy through a network of gateways they call the Lattice. Every planet with
complex life was touched by the Lattice. Your world was one of thousands.

The gateway you activated was a dormant seed node — a test. Only civilizations
that can decode the signal, build the key, and activate the portal are deemed
ready to join the Lattice. You have passed.

The Velar Fabricator they will teach you to build is not merely a machine.
It is a node in the Lattice. Every fabricator built on your world strengthens
the connection — and eventually, the two universes will merge.`

export function revealVelarPurpose(): void {
  journal.record({
    id: 9999,
    name: 'The Purpose of the Velar',
    category: 'cosmic',
    description: VELAR_PURPOSE_LORE,
    unlocks: [],
  }, 0)
  useUiStore.getState().addNotification(
    'Journal updated: "The Purpose of the Velar". Read it in your Discovery Journal.',
    'discovery'
  )
  try {
    getWorldSocket()?.send({ type: 'VELAR_PURPOSE_REVEALED' })
  } catch {}
}
