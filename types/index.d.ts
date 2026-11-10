export type Usage = {
  ctx?: number
  five?: number
  week?: number
  fiveReset?: string
  weekReset?: string
}

export type BreakTimer = { endsAt: number; minutes: number }

declare module 'claude-code' {
  interface PluginState {
    'constant-reader': {
      enabled: boolean
      usage: Usage | null
      verbIdx: number
      tipIdx: number
      timer: BreakTimer | null
      now: number
    }
  }
}
