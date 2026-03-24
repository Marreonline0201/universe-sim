import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from './node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const URL = process.env.PLAYTEST_URL || 'https://universe-sim-beryl.vercel.app/'
const DATA_DIR = path.join(__dirname, 'playtest-data')
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const runtimeDefaults = {
  clickToPlay: {
    x: 700,
    y: 420,
    attempts: 2,
    betweenMs: 180,
  },
  respawnDelayMs: 850,
  postRecoveryDelayMs: 220,
  survival: {
    strafeEvery: 3,
    dodgeEvery: 4,
    gatherEvery: 1,
    feedEvery: 1,
    evadeEvery: 5,
  },
  combat: {
    engageMs: 550,
    useDodgeEvery: 2,
  },
  detection: {
    panelSweepEvery: 5,
  },
}

function argValue(flag, fallback) {
  const idx = process.argv.indexOf(flag)
  if (idx === -1 || idx + 1 >= process.argv.length) return fallback
  return process.argv[idx + 1]
}

function pick(text, re, fallback = null) {
  const m = text.match(re)
  return m ? m[1] : fallback
}

function parseSnapshot(text) {
  return {
    hp: Number(pick(text, /\u2665\s*(\d+(?:\.\d+)?)/, '0')),
    food: Number(pick(text, /\u25c6\s*(\d+(?:\.\d+)?)/, '0')),
    water: Number(pick(text, /~\s*(\d+(?:\.\d+)?)/, '0')),
    energy: Number(pick(text, /\u26a1\s*(\d+(?:\.\d+)?)/, '0')),
    stamina: Number(pick(text, /\u25cf\s*(\d+(?:\.\d+)?)/, '0')),
    pos: pick(text, /Position:\s*\(([^)]+)\)/, null),
    deadOverlay: /YOU DIED|RESPAWN/i.test(text),
    clickToPlay: text.includes('CLICK TO PLAY'),
  }
}

async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true })
}

async function readText(page) {
  return page.evaluate(() => document.body?.innerText || '')
}

async function hasButtonByLabel(page, label) {
  return page.evaluate((needle) => {
    const buttons = Array.from(document.querySelectorAll('button'))
    return buttons.some((b) => (b.textContent || '').trim().includes(needle))
  }, label)
}

async function clickButtonByLabel(page, label) {
  return page.evaluate((needle) => {
    const buttons = Array.from(document.querySelectorAll('button'))
    const btn = buttons.find((b) => (b.textContent || '').trim().includes(needle))
    if (!btn) return false
    btn.click()
    return true
  }, label)
}

function parsePositiveInt(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n) || Number.isNaN(n)) return fallback
  const x = Math.trunc(n)
  if (x < 1) return fallback
  return x
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value))
}

function dedupeBy(arr, keyFn) {
  const seen = new Set()
  const out = []
  for (const item of arr) {
    const key = keyFn(item)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function scoreSeverity(issue, ratio) {
  if (issue === 'overlay_stuck' || issue === 'death') {
    if (ratio >= 0.5) return 'critical'
    if (ratio >= 0.25) return 'high'
    return 'medium'
  }
  if (issue === 'console_error') return ratio >= 0.25 ? 'high' : 'medium'
  return ratio >= 0.4 ? 'high' : 'medium'
}

function parseSignature(signature) {
  if (!signature || signature === 'clean') return []
  return signature.split('|').map((s) => s.trim()).filter(Boolean)
}

function classifyIssues(episodes) {
  const issueCounts = new Map()
  const sampleByIssue = new Map()

  for (const ep of episodes) {
    const tags = parseSignature(ep.signature)
    for (const issue of tags) {
      issueCounts.set(issue, (issueCounts.get(issue) || 0) + 1)
      if (!sampleByIssue.has(issue)) {
        sampleByIssue.set(issue, {
          episodeId: ep.episodeId,
          scenario: ep.scenario,
          signature: ep.signature,
          minHp: ep.minHp,
          minFood: ep.minFood,
          minWater: ep.minWater,
          deathCount: ep.deathCount,
          overlayStuckCount: ep.overlayStuckCount,
        })
      }
    }
  }

  const total = Math.max(episodes.length, 1)
  return Array.from(issueCounts.entries())
    .map(([issue, count]) => {
      const ratio = Number((count / total).toFixed(3))
      return {
        issue,
        count,
        ratio,
        severity: scoreSeverity(issue, ratio),
        sample: sampleByIssue.get(issue) || null,
      }
    })
    .sort((a, b) => {
      const sev = { critical: 3, high: 2, medium: 1, low: 0 }
      return (sev[b.severity] - sev[a.severity]) || (b.count - a.count)
    })
}

function mapIssueToFix(issue, severity) {
  const base = {
    issue,
    mode: 'auto_runtime_tuning',
    severity,
    autoExecutable: true,
    verifyWithEpisodes: 8,
  }

  if (issue === 'overlay_stuck') {
    return {
      ...base,
      title: 'Strengthen click-to-play recovery',
      strategy: 'Increase click-to-play retries and shorten retry delay to reacquire focus quickly.',
      expectedMetric: 'overlay_stuck ratio decreases in next cycle',
    }
  }
  if (issue === 'recovery_failed') {
    return {
      ...base,
      title: 'Harden overlay/death recovery handshake',
      strategy: 'Increase respawn stabilization and click-to-play retries before resuming scenario actions.',
      expectedMetric: 'recovery_failed count decreases in next cycle',
    }
  }
  if (issue === 'death') {
    return {
      ...base,
      title: 'Reduce combat aggression and prioritize recovery',
      strategy: 'Shorten combat pressure window and increase respawn stabilization delay.',
      expectedMetric: 'death ratio decreases in next cycle',
    }
  }
  if (issue === 'panel_fail' || issue === 'panel_missing') {
    return {
      ...base,
      title: 'Expand panel probing and relax panel-failure thresholds',
      strategy: 'Use broader panel labels and lower probe frequency to reduce false fails.',
      expectedMetric: 'panel fail/missing counts decrease in next cycle',
    }
  }
  if (issue === 'low_food' || issue === 'low_water') {
    return {
      ...base,
      title: 'Increase survival resource actions',
      strategy: 'Increase gather/feed cadence during survival steps.',
      expectedMetric: 'min food/water values increase in next cycle',
    }
  }
  if (issue === 'console_error') {
    return {
      ...base,
      title: 'Capture and isolate console error signatures',
      strategy: 'Tag repeated console errors and prioritize manual source patching.',
      mode: 'manual_source_patch',
      autoExecutable: false,
      expectedMetric: 'error count trend documented and narrowed',
    }
  }

  return {
    ...base,
    title: `Investigate ${issue}`,
    strategy: 'No mapped auto-fix. Keep collecting signals and patch manually.',
    mode: 'manual_source_patch',
    autoExecutable: false,
    expectedMetric: 'issue trend understood',
  }
}

function buildFixQueue(episodes) {
  const issues = classifyIssues(episodes)
  const queue = issues.map((entry, idx) => {
    const mapped = mapIssueToFix(entry.issue, entry.severity)
    return {
      id: `fix-${String(idx + 1).padStart(3, '0')}`,
      issue: entry.issue,
      count: entry.count,
      ratio: entry.ratio,
      severity: entry.severity,
      confidence: Number(Math.min(0.98, 0.55 + entry.ratio).toFixed(2)),
      sample: entry.sample,
      ...mapped,
      status: 'planned',
      createdAt: new Date().toISOString(),
    }
  })

  return dedupeBy(queue, (f) => f.issue)
}

function applyRuntimeFixes(runtimeConfig, fixQueue) {
  const applied = []

  for (const fix of fixQueue) {
    if (!fix.autoExecutable) continue

    if (fix.issue === 'overlay_stuck') {
      runtimeConfig.clickToPlay.attempts = Math.min(runtimeConfig.clickToPlay.attempts + 2, 8)
      runtimeConfig.clickToPlay.betweenMs = Math.max(runtimeConfig.clickToPlay.betweenMs - 40, 90)
      runtimeConfig.postRecoveryDelayMs = Math.max(runtimeConfig.postRecoveryDelayMs - 40, 120)
      applied.push({ id: fix.id, issue: fix.issue, action: 'runtime.clickToPlay.tuned' })
      continue
    }

    if (fix.issue === 'recovery_failed') {
      runtimeConfig.clickToPlay.attempts = Math.min(runtimeConfig.clickToPlay.attempts + 1, 8)
      runtimeConfig.respawnDelayMs = Math.min(runtimeConfig.respawnDelayMs + 200, 1800)
      runtimeConfig.postRecoveryDelayMs = Math.min(runtimeConfig.postRecoveryDelayMs + 80, 900)
      applied.push({ id: fix.id, issue: fix.issue, action: 'runtime.recovery.handshake_hardened' })
      continue
    }

    if (fix.issue === 'death') {
      runtimeConfig.combat.engageMs = Math.max(runtimeConfig.combat.engageMs - 120, 250)
      runtimeConfig.respawnDelayMs = Math.min(runtimeConfig.respawnDelayMs + 300, 1800)
      runtimeConfig.survival.evadeEvery = Math.max(runtimeConfig.survival.evadeEvery - 1, 2)
      applied.push({ id: fix.id, issue: fix.issue, action: 'runtime.combat.deescalated' })
      continue
    }

    if (fix.issue === 'panel_fail' || fix.issue === 'panel_missing') {
      runtimeConfig.detection.panelSweepEvery = Math.min(runtimeConfig.detection.panelSweepEvery + 1, 7)
      applied.push({ id: fix.id, issue: fix.issue, action: 'runtime.panelSweep.relaxed' })
      continue
    }

    if (fix.issue === 'low_food' || fix.issue === 'low_water') {
      runtimeConfig.survival.gatherEvery = 1
      runtimeConfig.survival.feedEvery = 1
      runtimeConfig.survival.evadeEvery = Math.max(runtimeConfig.survival.evadeEvery - 1, 2)
      applied.push({ id: fix.id, issue: fix.issue, action: 'runtime.survival.resource_boost' })
      continue
    }
  }

  return applied
}

async function recoverIfNeeded(page, eventLog, runtimeConfig) {
  const text = await readText(page)
  const snap = parseSnapshot(text)
  let recovered = true

  if (snap.deadOverlay) {
    if (await clickButtonByLabel(page, 'RESPAWN')) {
      eventLog.push({ type: 'recovery', action: 'respawn_click' })
      await delay(runtimeConfig.respawnDelayMs)
    }
  }

  const textAfterRespawn = await readText(page)
  const s2 = parseSnapshot(textAfterRespawn)
  if (s2.clickToPlay) {
    for (let i = 0; i < runtimeConfig.clickToPlay.attempts; i++) {
      await page.mouse.click(runtimeConfig.clickToPlay.x, runtimeConfig.clickToPlay.y).catch(() => {})
      await delay(runtimeConfig.clickToPlay.betweenMs)
    }
    eventLog.push({ type: 'recovery', action: 'click_to_play' })
    await delay(runtimeConfig.postRecoveryDelayMs)
  }

  const verifyText = await readText(page)
  const verifySnap = parseSnapshot(verifyText)
  if (verifySnap.deadOverlay || verifySnap.clickToPlay) {
    recovered = false
    eventLog.push({
      type: 'recovery',
      action: 'recovery_failed',
      deadOverlay: verifySnap.deadOverlay,
      clickToPlay: verifySnap.clickToPlay,
    })
  }

  return recovered
}

async function panelSweep(page) {
  const labels = ['INV', 'CRF', 'BLD', 'TEC', 'EVO', 'JRN', 'CHR', 'MAP', '?', 'SET']
  const state = {}

  await page.keyboard.press('Escape').catch(() => {})
  await delay(150)

  for (const label of labels) {
    if (!(await hasButtonByLabel(page, label))) {
      state[label] = 'missing'
      continue
    }

    try {
      await clickButtonByLabel(page, label)
      await delay(150)
      await page.keyboard.press('Escape').catch(() => {})
      state[label] = 'ok'
    } catch {
      state[label] = 'fail'
    }
  }

  await page.mouse.click(700, 420).catch(() => {})
  return state
}

async function runSurvivalStep(page, i, runtimeConfig) {
  await page.keyboard.down('Shift').catch(() => {})
  await page.keyboard.down('w').catch(() => {})
  if (i % runtimeConfig.survival.strafeEvery === 0) await page.keyboard.down('a').catch(() => {})
  if (i % runtimeConfig.survival.dodgeEvery === 0) await page.keyboard.down('d').catch(() => {})

  await page.mouse.move(640 + (i % 2 ? 220 : -220), 410 + (i % 3 ? 90 : -90), { steps: 18 }).catch(() => {})
  await delay(900)

  await page.keyboard.up('a').catch(() => {})
  await page.keyboard.up('d').catch(() => {})
  await page.keyboard.up('w').catch(() => {})
  await page.keyboard.up('Shift').catch(() => {})

  if (i % runtimeConfig.survival.gatherEvery === 0) await page.keyboard.press('g').catch(() => {})
  if (i % runtimeConfig.survival.feedEvery === 0) await page.keyboard.press('f').catch(() => {})
  if (i % runtimeConfig.survival.evadeEvery === 0) await page.keyboard.press('z').catch(() => {})
}

async function runCombatStep(page, i, runtimeConfig) {
  await page.keyboard.down('w').catch(() => {})
  await page.mouse.move(630 + i * 8, 400 + (i % 2 ? 80 : -80), { steps: 10 }).catch(() => {})
  await delay(runtimeConfig.combat.engageMs)
  await page.keyboard.up('w').catch(() => {})

  await page.keyboard.press('q').catch(() => {})
  await page.keyboard.press('q').catch(() => {})
  await page.keyboard.press('g').catch(() => {})
  if (i % runtimeConfig.combat.useDodgeEvery === 0) await page.keyboard.press('f').catch(() => {})
}

async function runCameraStep(page, i) {
  await page.keyboard.press('v').catch(() => {})
  await delay(100)
  await page.keyboard.press('v').catch(() => {})
  await delay(100)
  await page.keyboard.press('v').catch(() => {})

  await page.keyboard.down('w').catch(() => {})
  await page.mouse.move(700 + (i % 2 ? 260 : -260), 430 + (i % 3 ? 110 : -110), { steps: 22 }).catch(() => {})
  await delay(800)
  await page.keyboard.up('w').catch(() => {})
}

async function runUiStep(page) {
  await panelSweep(page)
  await delay(150)
}

function classifyFailure(ep, consoleErrors) {
  const labels = []

  if (ep.deathCount > 0) labels.push('death')
  if (ep.overlayStuckCount > 0) labels.push('overlay_stuck')
  if (ep.recoveryFailedCount > 0) labels.push('recovery_failed')
  if (ep.panelFailCount > 0) labels.push('panel_fail')
  if (ep.panelMissingCount > 0) labels.push('panel_missing')
  if (ep.minFood <= 20) labels.push('low_food')
  if (ep.minWater <= 20) labels.push('low_water')
  if (consoleErrors > 0) labels.push('console_error')

  if (labels.length === 0) labels.push('clean')
  return labels.sort().join('|')
}

function summarize(episodes) {
  const clusters = new Map()
  for (const ep of episodes) {
    const key = ep.signature
    if (!clusters.has(key)) {
      clusters.set(key, {
        signature: key,
        count: 0,
        examples: [],
      })
    }
    const c = clusters.get(key)
    c.count += 1
    if (c.examples.length < 3) {
      c.examples.push({
        episodeId: ep.episodeId,
        scenario: ep.scenario,
        minFood: ep.minFood,
        minWater: ep.minWater,
        deathCount: ep.deathCount,
      })
    }
  }

  return Array.from(clusters.values()).sort((a, b) => b.count - a.count)
}

async function runEpisodes(page, runId, episodesToRun, runtimeConfig) {
  const scenarios = ['survival', 'combat', 'camera', 'ui']
  const episodes = []
  const eventStream = []
  const consoleErrors = []

  const onConsole = (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text())
    }
  }
  page.on('console', onConsole)

  for (let ep = 1; ep <= episodesToRun; ep++) {
    const scenario = scenarios[(ep - 1) % scenarios.length]
    const episodeId = `${runId}-ep-${String(ep).padStart(3, '0')}`
    const localEvents = []
    const hpValues = []
    const foodValues = []
    const waterValues = []
    let deathCount = 0
    let overlayStuckCount = 0
    let panelFailCount = 0
    let panelMissingCount = 0
    let recoveryFailedCount = 0
    const consoleErrorStart = consoleErrors.length

    for (let step = 1; step <= 14; step++) {
      const recovered = await recoverIfNeeded(page, localEvents, runtimeConfig)
      if (!recovered) recoveryFailedCount += 1

      if (scenario === 'survival') await runSurvivalStep(page, step, runtimeConfig)
      if (scenario === 'combat') await runCombatStep(page, step, runtimeConfig)
      if (scenario === 'camera') await runCameraStep(page, step)
      if (scenario === 'ui') await runUiStep(page)

      const text = await readText(page)
      const snap = parseSnapshot(text)

      if (snap.deadOverlay) deathCount += 1
      if (snap.clickToPlay) overlayStuckCount += 1

      hpValues.push(snap.hp)
      foodValues.push(snap.food)
      waterValues.push(snap.water)

      localEvents.push({
        runId,
        episodeId,
        scenario,
        step,
        ts: new Date().toISOString(),
        snapshot: snap,
      })

      if (step % runtimeConfig.detection.panelSweepEvery === 0) {
        const panelState = await panelSweep(page)
        for (const v of Object.values(panelState)) {
          if (v === 'fail') panelFailCount += 1
          if (v === 'missing') panelMissingCount += 1
        }
        localEvents.push({
          runId,
          episodeId,
          scenario,
          step,
          ts: new Date().toISOString(),
          panelState,
        })
      }

      await delay(450)
    }

    const epSummary = {
      runId,
      episodeId,
      scenario,
      minHp: Math.min(...hpValues),
      avgHp: Number((hpValues.reduce((a, b) => a + b, 0) / hpValues.length).toFixed(2)),
      minFood: Math.min(...foodValues),
      minWater: Math.min(...waterValues),
      deathCount,
      overlayStuckCount,
      panelFailCount,
      panelMissingCount,
      recoveryFailedCount,
      consoleErrors: consoleErrors.length - consoleErrorStart,
    }

    epSummary.signature = classifyFailure(epSummary, epSummary.consoleErrors)
    episodes.push(epSummary)
    eventStream.push(...localEvents)

    console.log(`[pipeline] ${episodeId} scenario=${scenario} signature=${epSummary.signature} minHp=${epSummary.minHp} minFood=${epSummary.minFood} minWater=${epSummary.minWater}`)
  }

  page.off('console', onConsole)
  return { episodes, eventStream, consoleErrors }
}

async function writeOutputs(runId, episodes, eventStream, fixQueue, appliedFixes, runtimeConfig) {
  const runDir = path.join(DATA_DIR, runId)
  await fs.mkdir(runDir, { recursive: true })

  const clusters = summarize(episodes)
  const markdown = [
    `# Playtest Training Run ${runId}`,
    '',
    `- episodes: ${episodes.length}`,
    `- clean: ${episodes.filter((e) => e.signature === 'clean').length}`,
    `- non-clean: ${episodes.filter((e) => e.signature !== 'clean').length}`,
    `- planned fixes: ${fixQueue.length}`,
    `- applied runtime fixes: ${appliedFixes.length}`,
    '',
    '## Failure Clusters',
    ...clusters.map((c) => `- ${c.signature}: ${c.count}`),
    '',
    '## Fix Queue',
    ...(fixQueue.length === 0 ? ['- none'] : fixQueue.map((f) => `- ${f.id} ${f.severity} ${f.issue}: ${f.title}`)),
    '',
    '## Applied Fixes',
    ...(appliedFixes.length === 0 ? ['- none'] : appliedFixes.map((f) => `- ${f.id} ${f.issue}: ${f.action}`)),
    '',
  ].join('\n')

  await fs.writeFile(path.join(runDir, 'episodes.json'), JSON.stringify(episodes, null, 2), 'utf8')
  await fs.writeFile(path.join(runDir, 'failure_clusters.json'), JSON.stringify(clusters, null, 2), 'utf8')
  await fs.writeFile(path.join(runDir, 'fix_queue.json'), JSON.stringify(fixQueue, null, 2), 'utf8')
  await fs.writeFile(path.join(runDir, 'applied_fixes.json'), JSON.stringify(appliedFixes, null, 2), 'utf8')
  await fs.writeFile(path.join(runDir, 'runtime_config.json'), JSON.stringify(runtimeConfig, null, 2), 'utf8')
  await fs.writeFile(path.join(runDir, 'report.md'), markdown, 'utf8')
  await fs.writeFile(path.join(runDir, 'telemetry.jsonl'), eventStream.map((x) => JSON.stringify(x)).join('\n') + '\n', 'utf8')

  const latest = {
    runId,
    generatedAt: new Date().toISOString(),
    episodes,
    clusters,
    fixQueue,
    appliedFixes,
    runtimeConfig,
  }
  await fs.writeFile(path.join(DATA_DIR, 'latest.json'), JSON.stringify(latest, null, 2), 'utf8')

  return { runDir, clusters }
}

async function main() {
  const episodesToRun = parsePositiveInt(argValue('--episodes', '12'), 12)
  const cyclesArg = parsePositiveInt(argValue('--cycles', '1'), 1)
  const continuous = argValue('--continuous', 'false') === 'true'
  const headlessArg = argValue('--headless', 'false')
  const headless = headlessArg === 'true'

  await ensureDirs()

  console.log(`[pipeline] starting episodes=${episodesToRun} headless=${headless} cycles=${continuous ? 'infinite' : cyclesArg}`)
  console.log('[pipeline] launching browser...')
  const browser = await puppeteer.launch({
    headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900'],
    defaultViewport: { width: 1400, height: 900 },
  })

  console.log('[pipeline] browser launched')
  const page = await browser.newPage()

  console.log(`[pipeline] navigating to ${URL}`)
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await delay(3500)
  console.log('[pipeline] navigation ready')

  const runtimeConfig = deepClone(runtimeDefaults)
  let cycle = 0
  while (continuous || cycle < cyclesArg) {
    cycle += 1
    const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-c${String(cycle).padStart(3, '0')}`
    console.log(`[pipeline] cycle ${cycle} started run=${runId}`)

    const result = await runEpisodes(page, runId, episodesToRun, runtimeConfig)
    const fixQueue = buildFixQueue(result.episodes)
    const appliedFixes = applyRuntimeFixes(runtimeConfig, fixQueue)
    const outputs = await writeOutputs(
      runId,
      result.episodes,
      result.eventStream,
      fixQueue,
      appliedFixes,
      runtimeConfig,
    )

    const topIssue = fixQueue[0]?.issue || 'none'
    console.log(`[pipeline] cycle ${cycle} complete run=${runId} top_issue=${topIssue} output=${outputs.runDir}`)
    if (continuous) {
      await delay(1500)
    }
  }

  await browser.close()
}

main().catch((err) => {
  console.error('[pipeline] fatal:', err?.message || err)
  process.exit(1)
})
