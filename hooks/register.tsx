import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BreakTimer, Usage } from '../types'
import { BREAK_LINES, DONE_WORDS, TIPS, VERBS } from './lines'

const enabled = atom({ plugin: 'constant-reader', key: 'enabled' } as const, true)
const usage = atom({ plugin: 'constant-reader', key: 'usage' } as const, null)
const verbIdx = atom({ plugin: 'constant-reader', key: 'verbIdx' } as const, 0)
const tipIdx = atom({ plugin: 'constant-reader', key: 'tipIdx' } as const, 0)
const timer = atom({ plugin: 'constant-reader', key: 'timer' } as const, null)
const nowAtom = atom({ plugin: 'constant-reader', key: 'now' } as const, 0)

// Muted palette, easy on dark backgrounds.
const MIST = '#a3adb5'
const MIST_THICK = '#d0a070'
const SHINE = '#c9b27a'
const AMBER = '#c99a6a'
const BALLOON = '#c98282'
const TRACK = '#4a4d55'
const LABEL = '#9a9aa2'
const TOWER_WORD = 'DARKTOWER'

type Opts = { mistThreshold?: number; sounds?: boolean }

const rand = (n: number) => Math.floor(Math.random() * n)

// Thin bar: [filled, empty] so the track gets its own dim color.
function bar(percent: number, cells = 10): [string, string] {
  const full = Math.max(0, Math.min(cells, Math.round((percent / 100) * cells)))
  return ['━'.repeat(full), '─'.repeat(cells - full)]
}

function fmtLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m % 60)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`
}

// "45m", "1h30m", "90s", "1.5h", bare number = minutes.
function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase()
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t) * 60_000
  const re = /(\d+(?:\.\d+)?)\s*(h|m|s)/g
  let total = 0
  let hit = false
  for (const m of t.matchAll(re)) {
    hit = true
    total += Number(m[1]) * (m[2] === 'h' ? 3_600_000 : m[2] === 'm' ? 60_000 : 1000)
  }
  return hit && total > 0 ? total : null
}

function toUsage(ctx: number | undefined, limits: { kind: string; percentUsed: number; resetsAt?: string }[]): Usage {
  const five = limits.find(l => l.kind === 'five_hour')
  const week = limits.find(l => l.kind === 'seven_day')
  return {
    ctx,
    five: five?.percentUsed,
    week: week?.percentUsed,
    fiveReset: five?.resetsAt,
    weekReset: week?.resetsAt,
  }
}

let isWin = false
let soundsOn = true

async function isOn($: EngineInterface) {
  return read($, enabled)
}

function play($: EngineInterface, name: 'done' | 'ask' | 'break') {
  if (!soundsOn) return
  const path = `${$.plugin.root}/sounds/${name}.wav`
  if (isWin) {
    void $.process
      .run(
        ['powershell', '-NoProfile', '-NonInteractive', '-Command', `(New-Object Media.SoundPlayer '${path}').PlaySync()`],
        { timeoutMs: 20_000 },
      )
      .catch(() => {})
  } else {
    void $.audio.play({ asset: `sounds/${name}.wav` }).catch(() => {})
  }
}

function fireBreak($: EngineInterface) {
  $.ui.toast('All work and no play... Time for a break.')
  if (!isWin) {
    play($, 'break')
    return
  }
  const script = `${$.plugin.root}/scripts/break.ps1`
  const sound = soundsOn ? `${$.plugin.root}/sounds/break.wav` : ''
  const args = `'-NoProfile','-ExecutionPolicy','Bypass','-STA','-WindowStyle','Hidden','-File','${script}','-Index','${rand(BREAK_LINES)}','-Sound','${sound}'`
  void $.process
    .run(['powershell', '-NoProfile', '-NonInteractive', '-Command', `Start-Process powershell -ArgumentList ${args}`], { timeoutMs: 20_000 })
    .catch(err => $.ui.log(`constant-reader: break popup failed: ${String(err)}`, { to: 'debug' }))
}

export const register: Register = (on, options) => {
  const opts = options as Opts
  const threshold = opts.mistThreshold ?? 30
  soundsOn = opts.sounds ?? true
  let warned = false

  on('session.start', async ($, e, next) => {
    isWin = (await $.env.get('OS')) === 'Windows_NT'

    const stored = await $.store.get('enabled')
    if (typeof stored === 'boolean') await update($, enabled, () => stored)

    const u = await $.session.usage()
    await update($, usage, () => toUsage(u.context.percent, u.rateLimits))
    await update($, tipIdx, () => rand(TIPS.length))

    await $.command.register({
      name: 'reader',
      description: 'Constant Reader theme: on, off, status or tip',
      argumentHint: '[on|off|status|tip]',
      immediate: true,
    })
    await $.command.register({
      name: 'break',
      description: 'Break timer: /break 45m, /break off',
      argumentHint: '<45m|1h30m|off>',
      immediate: true,
    })

    // Rotate the spinner verb about every 30 s.
    $.clock.every(30_000, () => void update($, verbIdx, i => i + 1))

    // Timer tick: redraw the countdown, fire the popup when due.
    $.clock.every(1000, async () => {
      const t = await read($, timer)
      if (!t) return
      const now = await $.clock.now()
      if (now >= t.endsAt) {
        await update($, timer, () => null)
        fireBreak($)
      } else {
        await update($, nowAtom, () => now)
      }
    })

    return next(e)
  })

  on('command.run', { command: 'reader' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'on' || arg === 'off') {
      const v = arg === 'on'
      await update($, enabled, () => v)
      await $.store.set('enabled', v)
      return { text: v ? 'Welcome back, Constant Reader.' : 'The book is closed. Theme disabled.' }
    }
    if (arg === 'tip') {
      return { text: TIPS[rand(TIPS.length)] ?? '' }
    }
    const u = await read($, usage)
    const f = (n: number | undefined) => (n === undefined ? 'n/a' : `${Math.round(n)}%`)
    return {
      text: [
        `Constant Reader theme: ${(await isOn($)) ? 'on' : 'off'}`,
        `The Mist (context): ${f(u?.ctx)}, thick at ${threshold}%`,
        `Shine (5-hour limit used): ${f(u?.five)}`,
        `Dark Tower (weekly limit used): ${f(u?.week)}`,
      ].join('\n'),
    }
  })

  on('command.run', { command: 'break' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === '' || arg === 'status') {
      const t = await read($, timer)
      if (!t) return { text: 'No timer. Use /break 45m.' }
      return { text: `Break in ${fmtLeft(t.endsAt - (await $.clock.now()))}.` }
    }
    if (arg === 'off' || arg === 'stop' || arg === 'cancel') {
      await update($, timer, () => null)
      return { text: 'Timer cancelled.' }
    }
    const ms = parseDuration(arg)
    if (ms === null) return { text: `Can't read "${e.args}". Try /break 45m, /break 1h30m or /break off.` }
    const now = await $.clock.now()
    const t: BreakTimer = { endsAt: now + ms, minutes: Math.round(ms / 60_000) }
    await update($, timer, () => t)
    await update($, nowAtom, () => now)
    return { text: `Timer set: break in ${fmtLeft(ms)}.` }
  })

  on('session.measure', async ($, e, next) => {
    const u = toUsage(e.context.percent, e.rateLimits)
    await update($, usage, () => u)
    if (u.ctx !== undefined && u.ctx >= threshold && !warned && (await isOn($))) {
      warned = true
      $.ui.toast(`The mist is getting thick (${Math.round(u.ctx)}%). Time to /compact or hand off.`)
    }
    if (u.ctx !== undefined && u.ctx < threshold) warned = false
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, verbIdx, () => rand(VERBS.length))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const isSub = Boolean((e as { agentId?: string }).agentId)
    if (!isSub && (await isOn($))) {
      await update($, tipIdx, i => i + 1)
      if (!e.isAborted) play($, 'done')
    }
    return result
  })

  on('classic.Notification', async ($, e, next) => {
    if (e.notification_type === 'permission_prompt' && (await isOn($))) play($, 'ask')
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (!(await isOn($))) return next(e)
    const i = await read($, verbIdx)
    return next({ ...e, props: { ...e.props, word: VERBS[i % VERBS.length] ?? e.props.word } })
  })

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (!(await isOn($))) return next(e)
    const word = DONE_WORDS[Math.floor(e.props.durationMs / 1000) % DONE_WORDS.length] ?? e.props.word
    return next({ ...e, props: { ...e.props, word } })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await isOn($))) return next(e)
    const { Box, Text } = $.ui.resolve(e)

    const u = await read($, usage)
    const tip = TIPS[(await read($, tipIdx)) % TIPS.length]
    const t = await read($, timer)
    const now = t ? await read($, nowAtom) : 0
    const cols = e.props.bodyColumns ?? 100

    const ctx = u?.ctx
    const restless = ctx !== undefined && ctx >= threshold
    const mask = u?.five === undefined ? undefined : Math.max(0, 100 - u.five)
    const codeLeft = u?.week === undefined ? undefined : Math.max(0, 100 - u.week)
    const lit = codeLeft === undefined ? TOWER_WORD.length : Math.round((codeLeft / 100) * TOWER_WORD.length)
    const maskColor = mask === undefined ? TRACK : mask > 50 ? SHINE : mask > 20 ? AMBER : BALLOON
    const [pFull, pEmpty] = bar(ctx ?? 0)
    const [mFull, mEmpty] = bar(mask ?? 0)

    const passenger = (
      <Text>
        <Text color={LABEL}>THE MIST </Text>
        <Text color={restless ? MIST_THICK : MIST}>{pFull}</Text>
        <Text color={TRACK}>{pEmpty}</Text>
        <Text color={restless ? MIST_THICK : LABEL}> {ctx === undefined ? '--' : `${Math.round(ctx)}%`}</Text>
        {restless && <Text color={MIST_THICK}> thick</Text>}
      </Text>
    )
    const maskEl = (
      <Text>
        <Text color={LABEL}>SHINE </Text>
        <Text color={maskColor}>{mFull}</Text>
        <Text color={TRACK}>{mEmpty}</Text>
        <Text color={LABEL}> {mask === undefined ? 'n/a' : `${Math.round(mask)}%`}</Text>
      </Text>
    )
    const code = (
      <Text>
        <Text color={LABEL}>TOWER </Text>
        {TOWER_WORD.split('').map((ch, i) => (
          <Text color={i < lit ? BALLOON : TRACK}>
            {ch}
            {i === 3 ? ' ' : ''}
          </Text>
        ))}
      </Text>
    )
    const clock = t ? (
      <Text color={AMBER}>⏱ {fmtLeft(t.endsAt - now)} to break</Text>
    ) : null

    const wide = cols >= 100
    return (
      <Box flexDirection="column">
        {wide ? (
          <Box flexDirection="row" gap={3}>
            {passenger}
            {maskEl}
            {code}
          </Box>
        ) : (
          <Box flexDirection="column">
            {passenger}
            {maskEl}
            {code}
          </Box>
        )}
        <Box flexDirection="row" gap={2}>
          {clock}
          <Text dimColor italic>
            🎈 {tip}
          </Text>
        </Box>
      </Box>
    )
  })
}
