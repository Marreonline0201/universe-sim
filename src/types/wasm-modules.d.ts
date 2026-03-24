declare module '/wasm/physics/universe_physics.js' {
  const init: (input?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module) => Promise<unknown>
  export default init
  export function simulate_stellar_system(seed: bigint): string
  export function get_game_planet(seed: bigint): string
}

declare module '/wasm/terrain/universe_terrain.js' {
  const init: (input?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module) => Promise<unknown>
  export default init
  export function simulate_terrain(planetJson: string, seed: bigint): string
  export function get_heightmap(planetJson: string, seed: bigint): Float32Array
}

declare module '/wasm/chemistry/universe_chemistry.js' {
  const init: (input?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module) => Promise<unknown>
  export default init
  export function simulate_atmosphere(planetJson: string, seed: bigint): string
}
