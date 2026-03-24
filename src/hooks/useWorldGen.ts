/**
 * useWorldGen
 *
 * Coordinates client-side world generation:
 *   1. Calls WorldGenPipeline.generate(seed) to run the 3 WASM modules.
 *   2. Calls SpherePlanet.initFromWorld() to prime the terrain sampler.
 *   3. Returns loading state & the finished GeneratedWorld once ready.
 *
 * The world is generated once per session (subsequent mounts reuse it).
 * The seed comes from the server's worldSeed, falling back to a constant
 * until the socket is connected.
 */

import { useEffect, useRef, useState } from 'react'
import { WorldGenPipeline, type GeneratedWorld, type ProgressCallback } from '../world/WorldGenPipeline'
import { initFromWorld } from '../world/SpherePlanet'

// Shared singleton — lets multiple components see the same result without
// re-running the pipeline.
let _cachedWorld: GeneratedWorld | null = null
let _inFlight: Promise<GeneratedWorld> | null = null

export interface WorldGenState {
  status: 'idle' | 'loading' | 'done' | 'error'
  stage: string
  pct: number
  world: GeneratedWorld | null
  error: string | null
}

/**
 * @param seed  Numeric world seed from the server (or a constant fallback).
 *              Pass `null` to defer generation until the seed is known.
 */
export function useWorldGen(seed: number | bigint | null): WorldGenState {
  const [state, setState] = useState<WorldGenState>({
    status: _cachedWorld ? 'done' : 'idle',
    stage:  _cachedWorld ? 'done'  : '',
    pct:    _cachedWorld ? 100    : 0,
    world:  _cachedWorld,
    error:  null,
  })

  // Avoid triggering duplicate runs on strict-mode double-mount
  const started = useRef(false)

  useEffect(() => {
    if (seed === null) return          // wait for seed
    if (_cachedWorld) {
      // Already done in a previous mount — just update state
      setState({ status: 'done', stage: 'done', pct: 100, world: _cachedWorld, error: null })
      return
    }
    if (started.current) return        // already kicked off in another effect run
    started.current = true

    setState(s => ({ ...s, status: 'loading' }))

    const onProgress: ProgressCallback = (stage, pct) => {
      setState(s => ({ ...s, stage, pct }))
    }

    const run = _inFlight ?? WorldGenPipeline.generate(seed, onProgress)
    _inFlight = run

    run.then((world) => {
      _cachedWorld = world
      _inFlight    = null
      // Prime SpherePlanet so it samples the WASM heightmap from now on
      initFromWorld(world)
      setState({ status: 'done', stage: 'done', pct: 100, world, error: null })
    }).catch((err: unknown) => {
      _inFlight = null
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[useWorldGen] pipeline failed:', err)
      setState({ status: 'error', stage: 'error', pct: 0, world: null, error: msg })
    })
  }, [seed])

  return state
}
