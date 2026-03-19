import { Canvas } from '@react-three/fiber'
import { PerspectiveCamera, Sky, Stars } from '@react-three/drei'
import { Suspense, useEffect, useRef } from 'react'
import { SimulationEngine } from '../engine/SimulationEngine'
import { useGameStore } from '../store/gameStore'
import { CreatureRenderer } from './entities/CreatureRenderer'

export function SceneRoot() {
  const engineRef = useRef<SimulationEngine | null>(null)
  const setEngineReady = useGameStore(s => s.setEngineReady)

  useEffect(() => {
    const engine = new SimulationEngine({ gridX: 64, gridY: 32, gridZ: 64, seed: 42 })
    engineRef.current = engine
    engine.init().then(() => {
      engine.start()
      setEngineReady(true)
    })
    return () => engine.dispose()
  }, [setEngineReady])

  return (
    <Canvas
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ position: 'fixed', inset: 0 }}
      shadows
    >
      <PerspectiveCamera makeDefault fov={75} near={0.1} far={10000} position={[0, 10, 20]} />
      <ambientLight intensity={0.3} />
      <directionalLight
        position={[100, 200, 100]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={1000}
        shadow-camera-left={-256}
        shadow-camera-right={256}
        shadow-camera-top={256}
        shadow-camera-bottom={-256}
      />
      <Sky sunPosition={[100, 20, 100]} />
      <Stars radius={500} depth={50} count={5000} factor={4} />
      <Suspense fallback={null}>
        <TerrainMesh />
        <CreatureRenderer />
      </Suspense>
    </Canvas>
  )
}

function TerrainMesh() {
  return (
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[512, 512, 63, 63]} />
      <meshStandardMaterial color="#3a5c2a" wireframe={false} />
    </mesh>
  )
}
