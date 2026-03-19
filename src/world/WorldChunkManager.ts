import type { TerrainChunk, PlanetGenerator } from './PlanetGenerator'

const CHUNK_SIZE = 64   // cells per chunk
const CELL_SIZE  = 4    // meters per cell

/**
 * Manages chunk loading/unloading with LOD based on player distance.
 * Streams chunks from the generator as the player moves.
 *
 * Chunks are keyed by "cx,cz" strings. Loading is synchronous for now
 * (generator is fast enough for interactive frame rates at viewDistance ≤ 8).
 */
export class WorldChunkManager {
  private chunks: Map<string, TerrainChunk> = new Map()
  private loadingChunks: Set<string> = new Set()

  constructor(
    private generator: PlanetGenerator,
    private viewDistance: number = 8  // chunks in each direction
  ) {}

  /**
   * Call every frame with the player world-space position.
   * Loads new chunks within viewDistance, unloads distant ones.
   */
  update(playerX: number, playerZ: number): void {
    const chunkW = CHUNK_SIZE * CELL_SIZE
    const pcx = Math.floor(playerX / chunkW)
    const pcz = Math.floor(playerZ / chunkW)
    const vd = this.viewDistance

    // Collect keys that should be loaded
    const needed = new Set<string>()
    for (let dcx = -vd; dcx <= vd; dcx++) {
      for (let dcz = -vd; dcz <= vd; dcz++) {
        // Circular view distance
        if (dcx * dcx + dcz * dcz > vd * vd) continue
        const key = this.chunkKey(pcx + dcx, pcz + dcz)
        needed.add(key)
        if (!this.chunks.has(key) && !this.loadingChunks.has(key)) {
          this.load(pcx + dcx, pcz + dcz)
        }
      }
    }

    // Unload chunks outside view distance
    for (const key of this.chunks.keys()) {
      if (!needed.has(key)) {
        this.unload(...this.keyToCoords(key))
      }
    }
  }

  getChunk(cx: number, cz: number): TerrainChunk | undefined {
    return this.chunks.get(this.chunkKey(cx, cz))
  }

  /**
   * Sample height at world-space coordinates.
   * Returns 0 if the chunk is not yet loaded.
   */
  getHeightAt(worldX: number, worldZ: number): number {
    const chunkW = CHUNK_SIZE * CELL_SIZE
    const cx = Math.floor(worldX / chunkW)
    const cz = Math.floor(worldZ / chunkW)
    const chunk = this.getChunk(cx, cz)
    if (!chunk) return 0

    // Local cell coordinates within the chunk
    const localX = Math.floor(((worldX % chunkW) + chunkW) % chunkW / CELL_SIZE)
    const localZ = Math.floor(((worldZ % chunkW) + chunkW) % chunkW / CELL_SIZE)
    const col = Math.min(localX, CHUNK_SIZE - 1)
    const row = Math.min(localZ, CHUNK_SIZE - 1)
    return chunk.heightmap[row * CHUNK_SIZE + col]
  }

  /**
   * Returns loaded chunks sorted by distance to a world position.
   * Useful for rendering LOD decisions.
   */
  getLoadedChunksSorted(worldX: number, worldZ: number): TerrainChunk[] {
    const chunkW = CHUNK_SIZE * CELL_SIZE
    const cx = worldX / chunkW
    const cz = worldZ / chunkW
    return Array.from(this.chunks.values()).sort((a, b) => {
      const da = (a.x - cx) ** 2 + (a.z - cz) ** 2
      const db = (b.x - cx) ** 2 + (b.z - cz) ** 2
      return da - db
    })
  }

  get loadedCount(): number {
    return this.chunks.size
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private chunkKey(cx: number, cz: number): string {
    return `${cx},${cz}`
  }

  private keyToCoords(key: string): [number, number] {
    const [cx, cz] = key.split(',').map(Number)
    return [cx, cz]
  }

  private load(cx: number, cz: number): void {
    const key = this.chunkKey(cx, cz)
    this.loadingChunks.add(key)
    // Generator is synchronous; in a real implementation this would be a Worker task
    const chunk = this.generator.generateChunk(cx, cz)
    this.chunks.set(key, chunk)
    this.loadingChunks.delete(key)
  }

  private unload(cx: number, cz: number): void {
    this.chunks.delete(this.chunkKey(cx, cz))
  }
}
