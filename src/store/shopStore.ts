// ── shopStore.ts ────────────────────────────────────────────────────────────────
// M10 Track C: Client-side shop/trade panel state.
// Populated from SHOP_OPEN server message (when player talks to settlement leader).

import { create } from 'zustand'

export interface ShopCatalogItem {
  matId: number
  qty: number
  buyPrice: number    // settlement pays this to player (sell to settlement)
  sellPrice: number   // player pays this (buy from settlement)
}

interface ShopStoreState {
  open: boolean
  settlementId: number | null
  settlementName: string
  catalog: ShopCatalogItem[]
  openShop: (settlementId: number, settlementName: string, catalog: ShopCatalogItem[]) => void
  closeShop: () => void
  updateCatalog: (catalog: ShopCatalogItem[]) => void
}

export const useShopStore = create<ShopStoreState>((set) => ({
  open: false,
  settlementId: null,
  settlementName: '',
  catalog: [],
  openShop: (settlementId, settlementName, catalog) =>
    set({ open: true, settlementId, settlementName, catalog }),
  closeShop: () => set({ open: false, settlementId: null, settlementName: '', catalog: [] }),
  updateCatalog: (catalog) => set({ catalog }),
}))
