import { Suspense, useEffect, useRef } from 'react'
import { SignIn, useAuth, useUser } from '@clerk/react'
import { SceneRoot } from './rendering/SceneRoot'
import { HUD } from './ui/HUD'
import { AdminPanel } from './ui/AdminPanel'
import { loadSave, saveGame } from './store/saveStore'

export default function App() {
  const { isSignedIn, isLoaded } = useAuth()

  if (!isLoaded) return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
      Loading...
    </div>
  )

  return isSignedIn ? <GameWithSave /> : <LoginScreen />
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
      <SignIn routing="hash" />
    </div>
  )
}

// ── Game with auto-save ───────────────────────────────────────────────────────

function GameWithSave() {
  const { getToken } = useAuth()
  const { user } = useUser()
  const loaded = useRef(false)

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
      <AdminPanel />
    </>
  )
}
