// Time-of-day theme. hour 0-23 → 7 phase palette.
// Mirrors dailyos/project/app-shared.jsx useTheme().
export type Phase = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'evening' | 'night' | 'late'

export interface Theme {
  hour: number
  phase: Phase
  label: string
  greeting: string
  cta: string
  window: string
  accent: string
  accentSoft: string
  paper: string
  paperWarm: string
  line: string
  ink: string
  ink70: string
  ink50: string
  ink30: string
  ink12: string
  ink06: string
  sans: string
  mono: string
}

const SANS = '"Inter Tight", -apple-system, "Hiragino Kaku Gothic ProN", sans-serif'
const MONO = '"JetBrains Mono", ui-monospace, monospace'

const COMMON = {
  line: '#1d1f1e',
  ink: '#0b0c0b',
  ink70: 'rgba(11,12,11,0.7)',
  ink50: 'rgba(11,12,11,0.5)',
  ink30: 'rgba(11,12,11,0.3)',
  ink12: 'rgba(11,12,11,0.12)',
  ink06: 'rgba(11,12,11,0.06)',
  sans: SANS,
  mono: MONO,
} as const

export function getTheme(hour: number): Theme {
  const h = ((hour % 24) + 24) % 24
  if (h >= 5 && h < 9) {
    return { ...COMMON, hour: h, phase: 'dawn', label: '夜明け', greeting: 'おはようございます',
      cta: 'Morning sequence', window: '05:00 — 09:00',
      accent: '#c44d2e', accentSoft: '#e8b896', paper: '#fbf8f1', paperWarm: '#f5ecdb' }
  }
  if (h >= 9 && h < 12) {
    return { ...COMMON, hour: h, phase: 'morning', label: '午前の集中時間', greeting: 'おはようございます',
      cta: 'Deep work', window: '09:00 — 12:00',
      accent: '#b86a2e', accentSoft: '#d9b690', paper: '#fafaf5', paperWarm: '#f3eee0' }
  }
  if (h >= 12 && h < 15) {
    return { ...COMMON, hour: h, phase: 'noon', label: '実行のピーク', greeting: 'こんにちは',
      cta: 'Continue work', window: '12:00 — 15:00',
      accent: '#7e8a3c', accentSoft: '#bcc097', paper: '#fafaf7', paperWarm: '#f0eee5' }
  }
  if (h >= 15 && h < 18) {
    return { ...COMMON, hour: h, phase: 'afternoon', label: '午後のドリフト', greeting: 'こんにちは',
      cta: 'Stay focused', window: '15:00 — 18:00',
      accent: '#3a6d8a', accentSoft: '#a3b8c9', paper: '#f7f8f5', paperWarm: '#ebede4' }
  }
  if (h >= 18 && h < 22) {
    return { ...COMMON, hour: h, phase: 'evening', label: '夕暮れの振り返り', greeting: 'おつかれさまです',
      cta: 'Evening review', window: '18:00 — 22:00',
      accent: '#7a3d6e', accentSoft: '#bfa3b8', paper: '#f6f3ee', paperWarm: '#ece4dd' }
  }
  if (h >= 22 || h < 2) {
    return { ...COMMON, hour: h, phase: 'night', label: '一日の閉じ方', greeting: 'おつかれさまでした',
      cta: 'Soft close', window: '22:00 — 02:00',
      accent: '#3d4a8a', accentSoft: '#a3aac9', paper: '#f1f0ec', paperWarm: '#e6e3da' }
  }
  return { ...COMMON, hour: h, phase: 'late', label: '深夜・休息', greeting: 'もう休む時間です',
    cta: 'Rest', window: '02:00 — 05:00',
    accent: '#3a3d4e', accentSoft: '#9ea0b0', paper: '#eeece8', paperWarm: '#e0ddd4' }
}

export function formatTime(h: number, m = 0): string {
  return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round(m)).padStart(2, '0')}`
}
