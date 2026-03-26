import { Suspense, useEffect, useRef, lazy } from 'react'
import { SignIn, useAuth, useUser } from '@clerk/react'
import { SceneRoot } from './rendering/SceneRoot'
import { HUD } from './ui/HUD'
import { loadSave, saveGame } from './store/saveStore'
import { useWorldSocket } from './net/useWorldSocket'
import { useBootstrapStatus } from './hooks/useBootstrapStatus'
import { WorldBootstrapScreen } from './ui/WorldBootstrapScreen'
import { initWorldEventLogger } from './game/WorldEventLogger'
import { initCaveFeatures } from './game/CaveFeatureSystem'
import { initJournalSystem } from './game/JournalSystem'
import { initNPCRelationshipSystem } from './game/NPCRelationshipSystem'
import { initRecipeDiscovery } from './game/RecipeDiscoverySystem'
import { initBountyBoard } from './game/BountyBoardSystem'
import { initMerchantGuildSystem, refreshContracts } from './game/MerchantGuildSystem'
import { initResourceDepletion } from './game/ResourceDepletionSystem'
import { initWorldThreatSystem } from './game/WorldThreatSystem'
import { initTradeRouteSystem } from './game/TradeRouteSystem'
import { initAchievementShowcase, checkAndUpdateMilestones } from './game/AchievementShowcaseSystem'
import { initWeatherEffectsSystem } from './game/WeatherEffectsSystem'

// ── M20: Lazy-load AdminPanel (dev/admin only) ──────────────────────────────
const AdminPanel = lazy(() => import('./ui/AdminPanel').then(m => ({ default: m.AdminPanel })))

// Dev bypass: set VITE_DEV_BYPASS_AUTH=true in .env.local to skip Clerk login
const DEV_BYPASS = import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_AUTH === 'true'

export default function App() {
  // Bootstrap check must run before any conditional returns (rules of hooks)
  const bootstrap = useBootstrapStatus()

  if (DEV_BYPASS) {
    if (bootstrap.resolved && bootstrap.bootstrapping) {
      return <WorldBootstrapScreen status={bootstrap} />
    }
    return <DevGame />
  }

  // Show timelapse screen while world is forming — blocks all players
  if (bootstrap.resolved && bootstrap.bootstrapping) {
    return <WorldBootstrapScreen status={bootstrap} />
  }

  return <AuthedApp />
}

function AuthedApp() {
  const { isSignedIn, isLoaded } = useAuth()

  if (!isLoaded) return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
      Loading...
    </div>
  )

  return isSignedIn ? <GameWithSave /> : <LoginScreen />
}

// ── Dev mode game (no auth, no save) ─────────────────────────────────────────

function DevGame() {
  useWorldSocket()

  useEffect(() => {
    initWorldEventLogger()
    initCaveFeatures()
    initJournalSystem()
    initNPCRelationshipSystem()
    initRecipeDiscovery()
    initBountyBoard(0)
    initMerchantGuildSystem()
    refreshContracts(0)
    initResourceDepletion()
    initWorldThreatSystem()
    initTradeRouteSystem()
    initAchievementShowcase()
    checkAndUpdateMilestones()
    initWeatherEffectsSystem()
  }, [])

  return (
    <>
      <Suspense fallback={<div style={{ color: '#fff', padding: 20 }}>Initializing universe...</div>}>
        <SceneRoot />
      </Suspense>
      <HUD />
      <Suspense fallback={null}><AdminPanel /></Suspense>
    </>
  )
}

// ── Login screen ─────────────────────────────────────────────────────────────

function LoginScreen() {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'radial-gradient(ellipse at center, #0a0a1a 0%, #000 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 24,
    }}>
      <div style={{ textAlign: 'center', color: '#fff', marginBottom: 8 }}>
        <div style={{ fontSize: 42, fontWeight: 700, letterSpacing: 2 }}>UNIVERSE</div>
        <div style={{ fontSize: 14, opacity: 0.5, letterSpacing: 6 }}>SIMULATION</div>
      </div>
      <SignIn routing="virtual" fallbackRedirectUrl="/" />
    </div>
  )
}

// ── Game with auto-save ───────────────────────────────────────────────────────

function GameWithSave() {
  const { getToken } = useAuth()
  const { user } = useUser()
  const loaded = useRef(false)

  // Connect to the persistent Railway WebSocket server
  useWorldSocket()

  // M48 Track C: Initialize world event logger once on mount
  // M50 Track C: Initialize cave features
  // M51 Track A: Initialize player journal system
  // M51 Track B: Initialize NPC relationship system
  // M52 Track B: Initialize recipe discovery
  // M54 Track A: Initialize merchant guild system
  useEffect(() => {
    initWorldEventLogger()
    initCaveFeatures()
    initJournalSystem()
    initNPCRelationshipSystem()
    initRecipeDiscovery()
    initBountyBoard(0)
    initMerchantGuildSystem()
    refreshContracts(0)
    initResourceDepletion()
    initWorldThreatSystem()
    initTradeRouteSystem()
    initWeatherEffectsSystem()
    initAchievementShowcase()
    checkAndUpdateMilestones()
  }, [])

  // Load save on first sign-in
  useEffect(() => {
    if (loaded.current || !user) return
    loaded.current = true
    loadSave(getToken)
  }, [getToken, user])

  // Auto-save every 60 seconds
  useEffect(() => {
    if (!user) return
    const username = user.username ?? user.firstName ?? user.id
    const id = setInterval(() => saveGame(getToken, username), 60_000)
    return () => {
      clearInterval(id)
      // Save on unmount (tab close / logout)
      saveGame(getToken, username)
    }
  }, [getToken, user])

  return (
    <>
      <Suspense fallback={<div style={{ color: '#fff', padding: 20 }}>Initializing universe...</div>}>
        <SceneRoot />
      </Suspense>
      <HUD />
      <Suspense fallback={null}><AdminPanel /></Suspense>
    </>
  )
}
