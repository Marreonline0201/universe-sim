---
name: project_m8_companion_site
description: M8 Track 3 Science Companion — separate Next.js app at universe-companion, all files written, awaiting npm install + vercel deploy
type: project
---

M8 Track 3: Science Companion Website — full app hand-written at `C:\Users\ddogr\OneDrive\Desktop\Questions\universe-companion`.

**Status:** All source files complete. Deployment blocked pending Bash permission for `npm install && vercel deploy --prod`.

**Deploy command (run from companion root):**
```
cd "C:\Users\ddogr\OneDrive\Desktop\Questions\universe-companion" && npm install && vercel deploy --prod
```

After deploy: update `COMPANION_URL` in `universe-sim/src/ui/HUD.tsx` from `https://universe-companion.vercel.app` to the actual deployment URL if different.

**Also set in Vercel dashboard:** Enable AI Gateway at vercel.com/pioneer2026/universe-companion/settings → AI Gateway, then run `vercel env pull` in the companion directory to refresh the OIDC token.

**Why:** No ANTHROPIC_API_KEY — routes through Vercel AI Gateway with OIDC auth (VERCEL_OIDC_TOKEN). Model: `anthropic/claude-sonnet-4.6` (AI SDK v6 gateway slug, dots not hyphens).

**File manifest:**
- `app/page.tsx` — single-page chat UI, dark game aesthetic, useChat (AI SDK v6), MessageResponse component
- `app/layout.tsx` — metadata, globals import
- `app/globals.css` — Tailwind + prose-science markdown styles, cursor-blink, fadeSlideUp animations
- `app/api/chat/route.ts` — streamText, convertToModelMessages, toUIMessageStreamResponse (all v6 correct)
- `lib/systemPrompt.ts` — full science system prompt: thermodynamics, Arrhenius chemistry, O2/cave system, bacterial growth, geology
- `lib/generationLog.ts` — generation persistence (console.log to Vercel Function logs in v1)
- `components/ai-elements/message.tsx` — MessageResponse wrapper over react-markdown (AI Elements compatible interface)
- `package.json` — ai@^6.0.0, @ai-sdk/react@^3.0.0, next 15.3.0, react-markdown, nanoid
- `tailwind.config.ts`, `postcss.config.mjs`, `tsconfig.json`, `next.config.ts` — standard Next.js 15 config
- `.vercel/project.json` — orgId: team_kEnHD5MgVe5ERBChd2n2Qm5X, projectName: universe-companion

**HUD integration:**
- `COMPANION_URL` constant added to `universe-sim/src/ui/HUD.tsx`
- `?` button added top-right corner, opens companion in new tab, rust-orange styling matching game aesthetic

**How to apply:** Deploy blocker is only Bash permission. Once deployed, post URL to Slack channel C0AMWTPE0AE.
