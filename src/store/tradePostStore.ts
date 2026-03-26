// ── tradePostStore.ts ─────────────────────────────────────────────────────────
// M42 Track A: Player-to-player trade post store.
// Listings are synced via WebSocket (TRADE_POST_LIST / TRADE_POST_BUY / TRADE_POST_INIT).

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface TradePostListing {
  id: string           // `${playerId}_${Date.now()}`
  sellerName: string
  materialId: number
  itemId: number       // 0 if selling material
  quantity: number
  pricePerUnit: number // gold per unit
  listedAt: number     // timestamp
}

interface TradePostState {
  listings: TradePostListing[]
  myListings: string[]  // listing IDs owned by current player

  addListing(listing: TradePostListing): void
  removeListing(id: string): void
  setListings(listings: TradePostListing[]): void
  buyListing(id: string, buyerGold: number): { success: boolean; message: string }
}

export const useTradePostStore = create(persist<TradePostState>(
  (set, get) => ({
    listings: [],
    myListings: [],

    addListing(listing) {
      set((s) => ({
        listings: [...s.listings, listing],
      }))
    },

    removeListing(id) {
      set((s) => ({
        listings: s.listings.filter((l) => l.id !== id),
        myListings: s.myListings.filter((lid) => lid !== id),
      }))
    },

    setListings(listings) {
      set({ listings })
    },

    buyListing(id, buyerGold) {
      const listing = get().listings.find((l) => l.id === id)
      if (!listing) {
        return { success: false, message: 'Listing not found' }
      }
      const totalCost = listing.pricePerUnit * listing.quantity
      if (buyerGold < totalCost) {
        return { success: false, message: 'Not enough gold' }
      }
      set((s) => ({
        listings: s.listings.filter((l) => l.id !== id),
        myListings: s.myListings.filter((lid) => lid !== id),
      }))
      return { success: true, message: 'Purchased!' }
    },
  }),
  { name: 'tradepost-v1' }
))
