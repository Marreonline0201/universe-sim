// ── WeatherSectors.ts ──────────────────────────────────────────────────────────
// M8 Track 1: Client-side sector ID mapping.
// Must mirror the logic in server/src/WeatherSystem.js getSectorForPosition().
//
// Planet has 8 sectors:
//   0 = polar north, 7 = polar south
//   1,2 = temperate north (lon bands)
//   3,4 = desert (lon bands)
//   5,6 = tropical south (lon bands)
//
// Polar: |ny| > 0.7. Non-polar: mapped to lon bands 0-3.

/**
 * Returns the sector ID (0–7) for a world-space position on the planet surface.
 * Matches the server-side WeatherSystem.getSectorForPosition() logic exactly.
 */
export function getSectorIdForPosition(x: number, y: number, z: number): number {
  const len = Math.sqrt(x * x + y * y + z * z) || 1
  const nx = x / len, ny = y / len, nz = z / len

  // Polar test
  if (Math.abs(ny) > 0.7) {
    return ny > 0 ? 0 : 7
  }

  // Longitude band (0-3) from azimuth
  const azimuth     = Math.atan2(nx, nz)          // -π to π
  const normalised  = (azimuth + Math.PI) / (2 * Math.PI) // 0 to 1
  const band        = Math.min(3, Math.floor(normalised * 4))

  // Northern hemisphere: sectors 1-2; southern: 3-4 or 5-6
  if (ny >= 0) {
    return 1 + (band % 2)  // 1 or 2 (temperate north)
  } else {
    return 3 + (band % 2)  // 3 or 4 (desert / tropical south)
  }
}
