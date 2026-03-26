/**
 * PostProcessing.tsx
 * Raw Three.js post-processing pipeline — no @react-three/postprocessing dependency.
 * Uses three/examples/jsm/postprocessing to avoid fiber version conflicts.
 *
 * Effects:
 *   - UnrealBloom  (luminanceThreshold: 0.8, intensity: 0.4) — sun, fire, bioluminescence
 *   - Vignette     (offset: 0.3, darkness: 0.6) — ShaderPass with custom GLSL
 *
 * Fiber 8.x integration notes:
 *   - useFrame priority 1 runs AFTER fiber's internal render (priority 0).
 *   - The EffectComposer's RenderPass re-renders the scene into its own render target,
 *     then composites effects on top, and outputs to the screen. This is the standard
 *     pattern for injecting a composer inside fiber without disabling its loop.
 *   - We set gl.autoClear = false so the composer controls clearing.
 */

import { useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

// ── Vignette shader ───────────────────────────────────────────────────────────
const VignetteShader = {
  name: 'VignetteShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    offset:   { value: 0.3 },
    darkness: { value: 0.6 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float darkness;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - vec2(0.5)) * vec2(offset);
      float vignette = 1.0 - dot(uv, uv);
      // pow controls softness of the falloff
      vignette = clamp(pow(vignette, darkness), 0.0, 1.0);
      gl_FragColor = vec4(texel.rgb * vignette, texel.a);
    }
  `,
}

// ── Component ─────────────────────────────────────────────────────────────────
export function PostProcessing() {
  const { gl, scene, camera, size } = useThree()
  const composerRef = useRef<EffectComposer | null>(null)

  useEffect(() => {
    // Let the composer manage clearing so it doesn't double-clear with fiber.
    const prevAutoClear = gl.autoClear
    gl.autoClear = false

    const composer = new EffectComposer(gl)

    // 1. Re-render the scene into the composer's render target
    const renderPass = new RenderPass(scene, camera)
    composer.addPass(renderPass)

    // 2. Bloom — only brightens pixels above luminanceThreshold (0.8).
    //    Strength 0.4 is subtle; won't wash out terrain geometry.
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.width, size.height),
      0.4,  // strength / intensity
      0.4,  // radius
      0.8,  // luminanceThreshold
    )
    composer.addPass(bloomPass)

    // 3. Vignette — darkens screen edges for cinematic framing
    const vignettePass = new ShaderPass(VignetteShader)
    vignettePass.uniforms['offset'].value   = 0.3
    vignettePass.uniforms['darkness'].value = 0.6
    vignettePass.renderToScreen = true
    composer.addPass(vignettePass)

    composerRef.current = composer

    return () => {
      gl.autoClear = prevAutoClear
      composer.dispose()
      composerRef.current = null
    }
  }, [gl, scene, camera]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resize whenever the canvas size changes
  useEffect(() => {
    composerRef.current?.setSize(size.width, size.height)
  }, [size.width, size.height])

  // useFrame priority 1 — runs after fiber's internal frame (priority 0).
  // The composer's RenderPass handles the actual scene render; fiber's own
  // render still fires at priority 0 but gl.autoClear=false means it doesn't
  // blank out what the composer produces. The composer writes to the screen.
  useFrame((_state, _delta) => {
    const composer = composerRef.current
    if (!composer) return
    gl.clear()
    composer.render()
  }, 1)

  return null
}
