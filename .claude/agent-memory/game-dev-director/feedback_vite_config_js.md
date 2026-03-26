---
name: Vite config uses .js not .ts
description: vite.config.js takes precedence over vite.config.ts — always edit the .js file for build config changes
type: feedback
---

Edit vite.config.js, not vite.config.ts, for build configuration changes. Both files exist but Vite resolves .js first.

**Why:** Spent significant debugging time in M20 when manualChunks in vite.config.ts had zero effect. The actual config being read was vite.config.js (discovered by inserting a syntax error in .ts that didn't cause a build failure).

**How to apply:** When modifying Vite build config (rollupOptions, manualChunks, plugins), always edit vite.config.js. Keep .ts in sync as a reference copy.
