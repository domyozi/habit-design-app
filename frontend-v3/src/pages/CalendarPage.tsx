import type { Theme } from '@/lib/theme'

interface Props {
  theme: Theme
}

interface CalendarEvent {
  start: number
  end: number
  label: string
  cat: 'habit' | 'sugg' | 'boss' | 'task' | 'flow'
}

const EVENTS: CalendarEvent[] = [
  { start: 5, end: 7, label: '早起き / ストレッチ', cat: 'habit' },
  { start: 8, end: 8.5, label: '英語学習 (NEW)', cat: 'sugg' },
  { start: 9, end: 11, label: 'Vinci 提案書', cat: 'boss' },
  { start: 11.5, end: 12, label: 'GW計画 手書き', cat: 'task' },
  { start: 13, end: 14, label: '副業推進', cat: 'habit' },
  { start: 17, end: 18, label: '有酸素運動', cat: 'habit' },
  { start: 21, end: 21.5, label: 'Evening review · Flow', cat: 'flow' },
]

const HOUR_HEIGHT = 48

function formatHM(n: number): string {
  const h = Math.floor(n)
  const m = n % 1 ? '30' : '00'
  return `${String(h).padStart(2, '0')}:${m}`
}

export default function CalendarPage({ theme: t }: Props) {
  const hour = t.hour

  const colorOf = (c: CalendarEvent['cat']) => {
    if (c === 'boss') return t.accent
    if (c === 'sugg') return t.accentSoft
    if (c === 'flow') return t.ink
    return t.ink70
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '20px 24px 14px',
          borderBottom: `1px solid ${t.ink12}`,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.015em' }}>Calendar</div>
          <div
            style={{
              fontFamily: t.mono,
              fontSize: 10,
              color: t.ink50,
              marginTop: 2,
              letterSpacing: '0.14em',
            }}
          >
            5/2(土) · 1日24時間 · habits + tasks + flow
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['DAY', 'WEEK', 'MONTH'].map((m, i) => {
            const active = i === 0
            return (
              <button
                key={m}
                style={{
                  padding: '6px 12px',
                  fontFamily: t.mono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  background: active ? t.ink : 'transparent',
                  color: active ? t.paper : t.ink70,
                  border: `1px solid ${active ? t.line : t.ink12}`,
                  cursor: 'pointer',
                }}
              >
                {m}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <div
          style={{
            position: 'relative',
            minHeight: 24 * HOUR_HEIGHT,
            padding: '0 24px',
          }}
        >
          {Array.from({ length: 24 }).map((_, h) => (
            <div
              key={h}
              style={{
                display: 'grid',
                gridTemplateColumns: '52px 1fr',
                height: HOUR_HEIGHT,
                borderTop: `1px solid ${h === 0 ? 'transparent' : t.ink06}`,
              }}
            >
              <div
                style={{
                  fontFamily: t.mono,
                  fontSize: 10,
                  color: t.ink50,
                  letterSpacing: '0.1em',
                  paddingTop: 4,
                }}
              >
                {String(h).padStart(2, '0')}:00
              </div>
              <div></div>
            </div>
          ))}

          {/* Now line */}
          <div
            style={{
              position: 'absolute',
              left: 24 + 52,
              right: 24,
              top: hour * HOUR_HEIGHT + 4,
              height: 2,
              background: t.accent,
              zIndex: 5,
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: -6,
                top: -4,
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: t.accent,
              }}
            />
          </div>

          {/* Events */}
          {EVENTS.map((e, i) => {
            const isBoss = e.cat === 'boss'
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: 24 + 52 + 8,
                  right: 24,
                  top: e.start * HOUR_HEIGHT + 4,
                  height: (e.end - e.start) * HOUR_HEIGHT - 4,
                  padding: '6px 10px',
                  background: isBoss ? t.accent : t.paperWarm,
                  borderLeft: `3px solid ${colorOf(e.cat)}`,
                  border: `1px solid ${t.ink12}`,
                  color: isBoss ? t.paper : t.ink,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '-0.005em',
                  }}
                >
                  {e.label}
                </div>
                <div
                  style={{
                    fontFamily: t.mono,
                    fontSize: 9,
                    opacity: 0.7,
                    letterSpacing: '0.12em',
                    marginTop: 2,
                  }}
                >
                  {formatHM(e.start)} → {formatHM(e.end)} · {e.cat.toUpperCase()}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
