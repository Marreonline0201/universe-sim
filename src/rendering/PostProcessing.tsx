/**
 * PostProcessing.tsx
 * Raw Three.js post-processing pipeline — no @react-three/postprocessing dependency.
 * Uses three/examples/jsm/postprocessing to avoid fiber version conflicts.
 *
 * Effects (in order):
 *   1. RenderPass   — re-renders scene into composer render target
 *   2. SSAO         — screen-space ambient occlusion for contact shadows
 *   3. UnrealBloom  (luminanceThreshold: 0.8, intensity: 0.4) — sun, fire, bioluminescence
 *   4. ColorGrade   — filmic color grading (lift/gamma/gain, saturation, temperature)
 *   5. Vignette     (offset: 0.3, darkness: 0.6) — cinematic edge darkening
 *
 * M18 Track B additions: SSAO, ColorGrade with ACES filmic tonemapping.
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
import { useGameStore } from '../store/gameStore'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

// ── SSAO shader (screen-space ambient occlusion) ─────────────────────────────
// Approximates contact shadows by sampling depth in a hemisphere around each
// fragment. Uses 8 taps for performance (real-time viable at 60fps).
// Requires a depth texture from the renderer (set in component init).
const SSAOShader = {
  name: 'SSAOShader',
  uniforms: {
    tDiffuse:    { value: null as THREE.Texture | null },
    tDepth:      { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCameraNear: { value: 0.5 },
    uCameraFar:  { value: 20000.0 },
    uRadius:     { value: 0.5 },
    uIntensity:  { value: 0.6 },
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
    uniform sampler2D tDepth;
    uniform vec2 uResolution;
    uniform float uCameraNear;
    uniform float uCameraFar;
    uniform float uRadius;
    uniform float uIntensity;
    varying vec2 vUv;

    float readDepth(vec2 coord) {
      float fragCoordZ = texture2D(tDepth, coord).x;
      float viewZ = (uCameraNear * uCameraFar) / (uCameraFar - fragCoordZ * (uCameraFar - uCameraNear));
      return viewZ;
    }

    // Simple 8-tap SSAO with golden-angle spiral sampling
    float ssao(vec2 uv) {
      float depth = readDepth(uv);
      if (depth > uCameraFar * 0.99) return 1.0; // skip skybox

      float occlusion = 0.0;
      float radius = uRadius / depth;
      float goldenAngle = 2.39996323;

      for (int i = 0; i < 8; i++) {
        float fi = float(i);
        float angle = fi * goldenAngle;
        float r = radius * (fi + 1.0) / 8.0;
        vec2 offset = vec2(cos(angle), sin(angle)) * r / uResolution;
        float sampleDepth = readDepth(uv + offset);
        float rangeCheck = smoothstep(0.0, 1.0, uRadius / abs(depth - sampleDepth));
        occlusion += step(sampleDepth + 0.02, depth) * rangeCheck;
      }
      return 1.0 - (occlusion / 8.0) * uIntensity;
    }

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      float ao = ssao(vUv);
      gl_FragColor = vec4(texel.rgb * ao, texel.a);
    }
  `,
}

// ── Cinematic color grading + ACES filmic tonemapping ────────────────────────
// Lift/gamma/gain (ASC CDL model), saturation, color temperature, ACES filmic.
const ColorGradeShader = {
  name: 'ColorGradeShader',
  uniforms: {
    tDiffuse:     { value: null as THREE.Texture | null },
    uLift:        { value: new THREE.Vector3(0.0, 0.0, 0.02) },   // subtle blue in shadows
    uGamma:       { value: new THREE.Vector3(1.0, 1.0, 1.0) },    // neutral midtones
    uGain:        { value: new THREE.Vector3(1.05, 1.02, 0.98) },  // warm highlights
    uSaturation:  { value: 1.1 },                                   // slight boost
    uTemperature: { value: 0.03 },                                   // warm shift
    uExposure:    { value: 1.0 },
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
    uniform vec3 uLift;
    uniform vec3 uGamma;
    uniform vec3 uGain;
    uniform float uSaturation;
    uniform float uTemperature;
    uniform float uExposure;
    varying vec2 vUv;

    // ACES filmic tonemapping (Narkowicz 2015 fit)
    vec3 ACESFilm(vec3 x) {
      float a = 2.51;
      float b = 0.03;
      float c = 2.43;
      float d = 0.59;
      float e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }

    // ASC CDL: lift/gamma/gain color correction
    vec3 liftGammaGain(vec3 color, vec3 lift, vec3 gamma, vec3 gain) {
      vec3 liftedColor = color * gain + lift;
      return pow(max(liftedColor, vec3(0.0)), 1.0 / gamma);
    }

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = texel.rgb;

      // Exposure
      color *= uExposure;

      // Lift/Gamma/Gain
      color = liftGammaGain(color, uLift, uGamma, uGain);

      // Color temperature shift (warm = positive, cool = negative)
      color.r += uTemperature * 0.5;
      color.b -= uTemperature * 0.3;

      // Saturation via luminance
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, uSaturation);

      // ACES filmic tonemapping — maps HDR to LDR with film-like rolloff
      color = ACESFilm(color);

      // sRGB gamma (normally done by renderer, but we override with composer)
      color = pow(color, vec3(1.0 / 2.2));

      gl_FragColor = vec4(color, texel.a);
    }
  `,
}

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
  // Depth render target ref for per-frame SSAO depth update
  const depthRTRef = useRef<THREE.WebGLRenderTarget | null>(null)

  useEffect(() => {
    // Let the composer manage clearing so it doesn't double-clear with fiber.
    const prevAutoClear = gl.autoClear
    gl.autoClear = false

    // Enable depth texture for SSAO reads
    const prevOutputEncoding = gl.outputColorSpace
    gl.outputColorSpace = THREE.LinearSRGBColorSpace  // color grading handles gamma

    // Create a depth texture render target for SSAO
    const depthRT = new THREE.WebGLRenderTarget(size.width, size.height, {
      depthTexture: new THREE.DepthTexture(size.width, size.height),
      depthBuffer: true,
    })
    depthRT.depthTexture!.format = THREE.DepthFormat
    depthRT.depthTexture!.type = THREE.UnsignedIntType

    const composer = new EffectComposer(gl)

    // 1. Re-render the scene into the composer's render target
    const renderPass = new RenderPass(scene, camera)
    composer.addPass(renderPass)

    // 2. SSAO — screen-space ambient occlusion for contact shadows.
    //    8-tap golden-angle spiral. Radius 0.5, intensity 0.6.
    const ssaoPass = new ShaderPass(SSAOShader)
    ssaoPass.uniforms['uResolution'].value.set(size.width, size.height)
    ssaoPass.uniforms['uCameraNear'].value = camera.near
    ssaoPass.uniforms['uCameraFar'].value = camera.far
    ssaoPass.uniforms['uRadius'].value = 0.5
    ssaoPass.uniforms['uIntensity'].value = 0.6
    composer.addPass(ssaoPass)

    // 3. Bloom — only brightens pixels above luminanceThreshold (0.8).
    //    Strength 0.4 is subtle; won't wash out terrain geometry.
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.width, size.height),
      0.4,  // strength / intensity
      0.4,  // radius
      0.8,  // luminanceThreshold
    )
    composer.addPass(bloomPass)

    // 4. Cinematic color grading + ACES filmic tonemapping.
    //    Warm highlights, cool shadow lift, slight saturation boost.
    const colorGradePass = new ShaderPass(ColorGradeShader)
    composer.addPass(colorGradePass)

    // 5. Vignette — darkens screen edges for cinematic framing
    const vignettePass = new ShaderPass(VignetteShader)
    vignettePass.uniforms['offset'].value   = 0.3
    vignettePass.uniforms['darkness'].value = 0.6
    vignettePass.renderToScreen = true
    composer.addPass(vignettePass)

    composerRef.current = composer

    // Store depth RT for per-frame updates
    depthRTRef.current = depthRT

    // Pre-render a depth pass so SSAO has depth data on first frame
    gl.setRenderTarget(depthRT)
    gl.render(scene, camera)
    gl.setRenderTarget(null)
    ssaoPass.uniforms['tDepth'].value = depthRT.depthTexture

    return () => {
      gl.autoClear = prevAutoClear
      gl.outputColorSpace = prevOutputEncoding
      depthRT.dispose()
      depthRTRef.current = null
      composer.dispose()
      composerRef.current = null
    }
  }, [gl, scene, camera]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resize whenever the canvas size changes
  useEffect(() => {
    const composer = composerRef.current
    if (!composer) return
    composer.setSize(size.width, size.height)
    // Update SSAO resolution uniform
    const ssaoPass = composer.passes.find((p: any) => p.material?.uniforms?.uRadius) as any
    if (ssaoPass) {
      ssaoPass.uniforms['uResolution'].value.set(size.width, size.height)
    }
    // Resize depth render target
    const drt = depthRTRef.current
    if (drt) drt.setSize(size.width, size.height)
  }, [size.width, size.height])

  // useFrame priority 1 — runs after fiber's internal frame (priority 0).
  // The composer's RenderPass handles the actual scene render; fiber's own
  // render still fires at priority 0 but gl.autoClear=false means it doesn't
  // blank out what the composer produces. The composer writes to the screen.
  useFrame((_state, _delta) => {
    const composer = composerRef.current
    if (!composer) return

    // M69 Track B: Respect graphics settings — toggle bloom + vignette passes
    const { bloomEnabled, vignetteEnabled } = useGameStore.getState()
    const passes = composer.passes
    for (const p of passes) {
      // Identify by constructor name — bloom is UnrealBloomPass, vignette is last ShaderPass
      const name = (p as any).constructor?.name ?? ''
      if (name === 'UnrealBloomPass') (p as any).enabled = bloomEnabled
    }
    // Vignette is always the last pass
    if (passes.length > 0) {
      const lastPass = passes[passes.length - 1] as any
      if (lastPass.uniforms?.darkness) lastPass.enabled = vignetteEnabled
    }

    // Refresh depth texture for SSAO each frame
    const drt = depthRTRef.current
    if (drt) {
      gl.setRenderTarget(drt)
      gl.render(scene, camera)
      gl.setRenderTarget(null)
    }
    gl.clear()
    composer.render()
  }, 1)

  return null
}
