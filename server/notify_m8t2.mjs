// One-shot script: posts M8 Track 2 completion to Slack then exits.
import { WebClient } from '@slack/web-api'

const TOKEN   = process.env.SLACK_BOT_TOKEN
const CHANNEL = 'C0AMWTPE0AE'

const web = new WebClient(TOKEN)

const text = [
  '*M8 Track 2: Steel Age + Advanced Metallurgy — SHIPPED*',
  '',
  'Production: https://universe-sim-beryl.vercel.app',
  'Commit: fa8a098 | Deployment: dpl_C8LXREVs7LWR2Ti4v5b5wAZcZHqj | READY in 11.32s',
  '',
  '*What was built:*',
  '• *Real carburization chemistry* — Fe + C → Fe-C at 1200°C. tickBlastFurnaceSmelting() has two paths: (A) steel/cast-iron at 1200°C ratio-gated, (B) standard iron at 1000°C',
  '• *Carbon ratio gate* — 1 charcoal:1 iron_ingot = steel (0.8% C) | 2 charcoal:1 iron_ingot = cast iron (2.4% C, brittle)',
  '• *Quenching system* — hot_steel_ingot must reach water (y<=1.5m) within 30s or degrades to soft_steel at 50% quality. tickQuenching() in SurvivalSystems.ts',
  '• *HUD quench timer* — urgent orange countdown, turns red at 10s. Armor chest slot bottom-left, click to equip Steel Chestplate',
  '• *New MAT IDs* — STEEL_INGOT=44, CAST_IRON_INGOT=45, HOT_STEEL_INGOT=46, SOFT_STEEL=47',
  '• *New ITEM IDs* — STEEL_SWORD_M8=52 (45 dmg, 2.5x iron), STEEL_CHESTPLATE=53 (40% armor), STEEL_CROSSBOW=54 (35 dmg, 30m), CAST_IRON_POT=55, CAST_IRON_DOOR=56',
  '• *Recipes 71-75* — Steel Sword, Steel Chestplate, Steel Crossbow, Cast Iron Pot, Cast Iron Door',
  '• *Armor absorption* — equippedArmorSlot in playerStore, applyArmorAbsorptionSync() reduces incoming damage by 40%',
  '• *civLevel 3 gate* — SettlementManager broadcasts SETTLEMENT_UNLOCKED_STEEL. WorldSocket marks steel_making researched + discovers recipes 71-75',
  '• *CraftingPanel hints* — steel recipes show carburization ratio guide inline',
  '• *Bonus fix* — removed duplicate WeatherRendererWrapper (pre-existing TS2393)',
  '',
  '*Pass criteria — all PASS (code audit + build logs):*',
  ':white_check_mark: 1200°C blast furnace + iron_ingot + charcoal → hot_steel_ingot, 30s quench timer',
  ':white_check_mark: Player near ocean (y<=1.5m) → auto-quench → steel_ingot full quality',
  ':white_check_mark: 2x charcoal:iron_ingot → cast_iron_ingot direct (no quench needed)',
  ':white_check_mark: Steel Sword damage=45 (2.5x iron_knife 18) in EquipSystem STATS',
  ':white_check_mark: Armor slot in HUD, Steel Chestplate → 40% damage absorption via applyArmorAbsorptionSync()',
  ':white_check_mark: civLevel 3 → SETTLEMENT_UNLOCKED_STEEL → steel_making tech + recipe discovery',
  '',
  'Build: 1324 modules, 0 TypeScript errors, 11.32s. Zero runtime errors in production.',
].join('\n')

try {
  const result = await web.chat.postMessage({ channel: CHANNEL, text })
  if (result.ok) {
    console.log('Slack notification posted. ts:', result.ts)
  } else {
    console.error('Slack error:', result.error)
    process.exit(1)
  }
} catch (err) {
  console.error('Failed to post:', err.message)
  process.exit(1)
}
