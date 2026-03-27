import { Suspense, useEffect, useRef, lazy } from 'react'
import { SignIn, useAuth, useUser } from '@clerk/react'
import { SceneRoot } from './rendering/SceneRoot'
import { HUD } from './ui/HUD'
// M72-4: Ecosystem dashboard — live organism/species stats overlay
import { EcosystemDashboard } from './ui/EcosystemDashboard'
import { loadOffline, saveOffline } from './game/OfflineSaveManager'
import { useWorldSocket } from './net/useWorldSocket'
import { useBootstrapStatus } from './hooks/useBootstrapStatus'
import { WorldBootstrapScreen } from './ui/WorldBootstrapScreen'

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

// ── M69 Track A: Dynamic import of all game systems ─────────────────────────
// Consolidates 40+ init* imports into a single lazy chunk so the main bundle
// ships only the rendering shell. Systems load asynchronously after mount.
function useGameSystemsBootstrap(civTier: number = 0) {
  const initialized = useRef(false)
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    import('./game/GameSystemsBootstrap').then(({ bootstrapGameSystems }) => {
      bootstrapGameSystems(civTier)
    })
  }, [civTier])
}

// ── Dev mode game (no auth, no save) ─────────────────────────────────────────

function DevGame() {
  useWorldSocket()
  useGameSystemsBootstrap(0)

  return (
    <>
      <Suspense fallback={<div style={{ color: '#fff', padding: 20 }}>Initializing universe...</div>}>
        <SceneRoot />
      </Suspense>
      <HUD />
      <EcosystemDashboard />
      {import.meta.env.DEV && <Suspense fallback={null}><AdminPanel /></Suspense>}
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
      <SignIn fallbackRedirectUrl="/" />
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

  // M69 Track A: Lazy-load all game systems after mount
  useGameSystemsBootstrap(0)

  // Load save on first sign-in
  useEffect(() => {
    if (loaded.current || !user) return
    loaded.current = true
    loadOffline()
  }, [user])

  // Auto-save every 60 seconds
  useEffect(() => {
    if (!user) return
    const id = setInterval(() => saveOffline(), 60_000)
    return () => {
      clearInterval(id)
      saveOffline()
    }
  }, [user])

  return (
    <>
      <Suspense fallback={<div style={{ color: '#fff', padding: 20 }}>Initializing universe...</div>}>
        <SceneRoot />
      </Suspense>
      <HUD />
      <EcosystemDashboard />
      {import.meta.env.DEV && <Suspense fallback={null}><AdminPanel /></Suspense>}
    </>
  )
}
