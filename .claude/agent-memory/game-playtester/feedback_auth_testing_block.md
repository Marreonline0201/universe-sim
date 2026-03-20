---
name: Clerk + Cloudflare blocks automated signup
description: Automated browser cannot create new accounts — Clerk signup has Cloudflare Turnstile CAPTCHA that blocks headless browsers
type: feedback
---

Attempting to sign up via agent-browser on the live Vercel deployment (universe-sim-beryl.vercel.app) is blocked by Cloudflare Turnstile bot protection embedded in the Clerk signup form. The checkbox renders as an iframe and the bot challenge repeats even after appearing to succeed.

**Why:** Clerk's production/dev signup flow now includes Cloudflare Turnstile by default. The headless Playwright browser is detected as a bot and cannot pass the challenge.

**How to apply:** For future playtesting sessions that require authentication, the designer should either:
1. Pre-create a test account and save Clerk session state to a file (agent-browser state save auth.json) during a manual login
2. Or share an existing account's session token/cookies for reuse
3. Alternatively test via VITE_DEV_BYPASS_AUTH=true in a local dev build rather than the production Vercel deployment

The login screen (Clerk SignIn component) itself works fine and does NOT have the CAPTCHA — only the Sign Up flow. Existing account sign-in should be testable if credentials are provided.
