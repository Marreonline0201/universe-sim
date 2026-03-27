/**
 * useIsAdmin — returns true only for admin/dev users.
 *
 * Matches the same logic as AdminPanel.tsx:
 *   - DEV mode with VITE_DEV_BYPASS_AUTH=true → always admin
 *   - userId matches VITE_ADMIN_USER_ID → admin
 *   - Everyone else → false (regular player)
 */
import { useAuth } from '@clerk/react'

const DEV_BYPASS = import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_AUTH === 'true'

export function useIsAdmin(): boolean {
  // In DEV_BYPASS mode, useAuth is not guaranteed to be set up, so skip it
  const { userId } = useAuth()
  return DEV_BYPASS || userId === import.meta.env.VITE_ADMIN_USER_ID
}
