import type { Theme } from '@/lib/theme'
import { APP, type Habit } from '@/lib/mockData'
import { SOURCE_META } from '@/lib/habitTemplates'
import { MonoLabel } from '@/components/today/MonoLabel'
import { MiniGraph } from './MiniGraph'
import { TodayCell } from './TodayCell'

interface Props {
  theme: Theme
  onNewHabit: () => void
}

const TYPE_GLYPH: Record<string, string> = {
  boolean: '◯',
  'time-target': '🌅',
  count: '#',
  duration: '⏱',
  distance: '→',
  pages: '📖',
  score: '△',
  weight: '◐',
  currency: '¥',
  words: '◧',
}

const COLUMNS = '34px 1.7fr 1.4fr 1fr 80px 50px 70px'

function goalText(h: Habit): string {
  const g = h.goal
  if (g.kind === 'before') return `≤ ${g.value}`
  if (g.kind === 'lte') return `≤ ${g.value}${h.unit ?? ''}`
  if (g.kind === 'done') return 'やる'
  return `≥ ${g.value}${h.unit ?? ''}`
}

export function HabitsTable({ theme: t, onNewHabit }: Props) {
  const a = APP
  const coreHabits = a.habits.filter((h) => h.cat === 'core')
  const microHabits = a.habits.filter((h) => h.cat === 'micro')
  const autoCount = a.habits.filter((h) => SOURCE_META[h.source]?.auto).length

  return (
    <div
      style={{
        borderRight: `1px solid ${t.ink12}`,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '20px 24px 14px',
          borderBottom: `1px solid ${t.ink12}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.015em' }}>Habits</div>
          <div
            style={{
              fontFamily: t.mono,
              fontSize: 10,
              color: t.ink50,
              marginTop: 2,
              letterSpacing: '0.14em',
            }}
          >
            {a.habits.length} 件 · 計測タイプ別 · 自動取込 {autoCount} 件
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={onNewHabit}
            style={{
              padding: '7px 12px',
              fontFamily: t.mono,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              background: t.ink,
              color: t.paper,
              border: `1px solid ${t.line}`,
              cursor: 'pointer',
            }}
          >
            + NEW HABIT
          </button>
          <button
            style={{
              padding: '7px 12px',
              fontFamily: t.mono,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              background: 'transparent',
              color: t.ink70,
              border: `1px solid ${t.ink12}`,
              cursor: 'pointer',
            }}
          >
            CONNECT SOURCES
          </button>
        </div>
      </div>

      {/* Column headers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: COLUMNS,
          gap: 14,
          padding: '9px 24px',
          borderBottom: `1px solid ${t.line}`,
          background: t.paperWarm,
          fontFamily: t.mono,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.14em',
          color: t.ink50,
        }}
      >
        <div></div>
        <div>HABIT · TYPE</div>
        <div>TODAY</div>
        <div>30D TREND</div>
        <div style={{ textAlign: 'right' }}>MO</div>
        <div style={{ textAlign: 'right' }}>STRK</div>
        <div style={{ textAlign: 'right' }}>SOURCE</div>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <div
          style={{
            padding: '10px 24px 6px',
            background: t.paperWarm,
            borderBottom: `1px solid ${t.ink12}`,
          }}
        >
          <MonoLabel theme={t}>CORE · {coreHabits.length}</MonoLabel>
        </div>
        {coreHabits.map((h) => {
          const sm = SOURCE_META[h.source]
          const pct = h.month / h.target
          const lag = pct < 0.5
          return (
            <div
              key={h.id}
              style={{
                display: 'grid',
                gridTemplateColumns: COLUMNS,
                gap: 14,
                alignItems: 'center',
                padding: '14px 24px',
                borderBottom: `1px solid ${t.ink06}`,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  border: `1.5px solid ${t.line}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: t.mono,
                  fontSize: 11,
                  fontWeight: 700,
                  background: t.paper,
                }}
              >
                {TYPE_GLYPH[h.type]}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{h.label}</div>
                <div
                  style={{
                    fontFamily: t.mono,
                    fontSize: 9,
                    color: t.ink50,
                    marginTop: 3,
                    letterSpacing: '0.1em',
                  }}
                >
                  {h.type.toUpperCase()} · 目標 {goalText(h)}
                </div>
              </div>
              <div>
                <TodayCell habit={h} theme={t} />
              </div>
              <div>
                <MiniGraph habit={h} theme={t} />
              </div>
              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    fontFamily: t.mono,
                    fontSize: 11,
                    fontWeight: 700,
                    color: lag ? t.accent : t.ink,
                  }}
                >
                  {h.month}/{h.target}
                </div>
                <div
                  style={{
                    fontFamily: t.mono,
                    fontSize: 9,
                    color: t.ink50,
                  }}
                >
                  {Math.round(pct * 100)}%
                </div>
              </div>
              <div
                style={{
                  textAlign: 'right',
                  fontFamily: t.mono,
                  fontSize: 11,
                  fontWeight: 700,
                  color: h.streak > 0 ? t.accent : t.ink30,
                }}
              >
                {h.streak}d
              </div>
              <div style={{ textAlign: 'right' }}>
                <span
                  title={sm?.label}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: '3px 6px',
                    fontFamily: t.mono,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    background: sm?.auto ? t.ink : 'transparent',
                    color: sm?.auto ? t.paper : t.ink70,
                    border: sm?.auto ? `1px solid ${t.line}` : `1px solid ${t.ink12}`,
                  }}
                >
                  {sm?.glyph}
                </span>
              </div>
            </div>
          )
        })}

        <div
          style={{
            padding: '10px 24px 6px',
            background: t.paperWarm,
            borderBottom: `1px solid ${t.ink12}`,
          }}
        >
          <MonoLabel theme={t}>MICRO · {microHabits.length}</MonoLabel>
        </div>
        {microHabits.map((h) => {
          const sm = SOURCE_META[h.source]
          return (
            <div
              key={h.id}
              style={{
                display: 'grid',
                gridTemplateColumns: COLUMNS,
                gap: 14,
                alignItems: 'center',
                padding: '14px 24px',
                borderBottom: `1px solid ${t.ink06}`,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  border: `1.5px solid ${t.line}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: t.mono,
                  fontSize: 11,
                  background: t.paper,
                }}
              >
                ◯
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{h.label}</div>
                <div
                  style={{
                    fontFamily: t.mono,
                    fontSize: 9,
                    color: t.ink50,
                    marginTop: 3,
                    letterSpacing: '0.1em',
                  }}
                >
                  {h.type.toUpperCase()} · {goalText(h)}
                </div>
              </div>
              <div>
                <TodayCell habit={h} theme={t} />
              </div>
              <div>
                <MiniGraph habit={h} theme={t} />
              </div>
              <div
                style={{
                  textAlign: 'right',
                  fontFamily: t.mono,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {h.month}/{h.target}
              </div>
              <div
                style={{
                  textAlign: 'right',
                  fontFamily: t.mono,
                  fontSize: 11,
                  fontWeight: 700,
                  color: t.accent,
                }}
              >
                {h.streak}d
              </div>
              <div style={{ textAlign: 'right' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    padding: '3px 6px',
                    fontFamily: t.mono,
                    fontSize: 9,
                    color: t.ink70,
                    border: `1px solid ${t.ink12}`,
                  }}
                >
                  {sm?.glyph}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
