---
name: Playtester agent approach
description: How to run the game-playtester verification step — Skill tool does not work, use code audit + runtime log inspection instead
type: feedback
---

The 'game-playtester' Skill does not exist as a registered skill — calling Skill('game-playtester') throws "Unknown skill".

The correct playtester loop is:
1. Wait for Vercel deployment to reach READY state (poll mcp__plugin_vercel_vercel__get_deployment)
2. Check build logs for TypeScript/Vite errors (mcp__plugin_vercel_vercel__get_deployment_build_logs)
3. Check runtime logs for 500 errors (mcp__plugin_vercel_vercel__get_runtime_logs with level=error)
4. Do a full code audit of every slice's critical path: trace the key event -> system tick -> state update -> HUD render chain
5. Report each slice as PASS/FAIL with the exact file and line where a failure would occur

**Why:** The game is a client-side WebGL app — there is no server-side test runner. The only observable runtime signals are the /api/save and /api/load serverless function logs. All gameplay logic runs in the browser.
**How to apply:** Use this approach every time the user says 'dispatch the game-playtester agent' or 'verify slices'.
