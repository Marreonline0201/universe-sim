import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
  },
  server: {
    fs: {
      // Allow imports from the parent universe-sim directory (for structure.md)
      allow: ['..'],
    },
  },
})
