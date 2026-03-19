import { Suspense } from 'react'
import { SceneRoot } from './rendering/SceneRoot'
import { HUD } from './ui/HUD'

export default function App() {
  return (
    <>
      <Suspense fallback={<div style={{ color: '#fff', padding: 20 }}>Initializing universe...</div>}>
        <SceneRoot />
      </Suspense>
      <HUD />
    </>
  )
}
