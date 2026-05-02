import type { Theme } from '@/lib/theme'
import { APP } from '@/lib/mockData'
import { MonoLabel } from '@/components/today/MonoLabel'
import { fetchUserContext } from '@/lib/api'
import { useRemoteData } from '@/lib/useRemoteData'

interface Props {
  theme: Theme
}

const MOOD_COLOR: Record<string, string> = {
  focused: '#c45c2a',
  warm: '#b86a2e',
  steady: '#3a6d8a',
  tense: '#a34a2e',
  reflective: '#7a3d6e',
}

export default function MemoryPage({ theme: t }: Props) {
  const a = APP
  const remoteCtx = useRemoteData(fetchUserContext, [])
  const ctx = remoteCtx.data
  const isMock = !ctx && !remoteCtx.loading

  const identity = ctx?.identity ?? a.memory.identity
  const goal = ctx?.goal_summary ?? a.memory.goal
  const patterns = ctx?.patterns?.length ? ctx.patterns : a.memory.patterns
  const keywords = ctx?.values_keywords?.length ? ctx.values_keywords : a.memory.keywords

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        gridTemplateColumns: '1fr 1.2fr',
        minHeight: 0,
      }}
    >
      {/* LEFT — AI memory */}
      <div
        style={{
          borderRight: `1px solid ${t.ink12}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
        }}
      >
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
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.015em' }}>Memory</div>
            <div
              style={{
                fontFamily: t.mono,
                fontSize: 10,
                color: t.ink50,
                marginTop: 2,
                letterSpacing: '0.14em',
              }}
            >
              あなたについて AI が覚えていること
            </div>
          </div>
          <span
            style={{
              fontFamily: t.mono,
              fontSize: 10,
              color: t.accent,
              letterSpacing: '0.16em',
            }}
          >
            ● {isMock ? 'MOCK' : 'LIVE'}
          </span>
        </div>
        <div
          style={{
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 22,
          }}
        >
          <div>
            <MonoLabel theme={t}>IDENTITY</MonoLabel>
            <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.4, marginTop: 8 }}>
              {identity}
            </div>
          </div>
          <div>
            <MonoLabel theme={t}>NORTH STAR</MonoLabel>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                lineHeight: 1.4,
                marginTop: 8,
                color: t.accent,
              }}
            >
              {goal}
            </div>
          </div>
          <div>
            <MonoLabel theme={t}>OBSERVED PATTERNS</MonoLabel>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                marginTop: 10,
              }}
            >
              {patterns.map((p, i) => (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '24px 1fr',
                    gap: 10,
                    padding: '10px 0',
                    borderTop: `1px solid ${t.ink06}`,
                  }}
                >
                  <span
                    style={{
                      fontFamily: t.mono,
                      fontSize: 10,
                      color: t.ink30,
                      fontWeight: 700,
                    }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ fontSize: 13, color: t.ink70, lineHeight: 1.55 }}>{p}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <MonoLabel theme={t}>KEYWORDS</MonoLabel>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                marginTop: 10,
              }}
            >
              {keywords.map((k) => (
                <span
                  key={k}
                  style={{
                    padding: '5px 10px',
                    fontFamily: t.mono,
                    fontSize: 11,
                    letterSpacing: '0.04em',
                    border: `1px solid ${t.line}`,
                    background: t.paperWarm,
                    color: t.ink70,
                  }}
                >
                  {k}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT — Diary feed */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
          background: t.paperWarm,
        }}
      >
        <div style={{ padding: '20px 24px 14px', borderBottom: `1px solid ${t.ink12}` }}>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>
            Diary · AI feedback
          </div>
          <div
            style={{
              fontFamily: t.mono,
              fontSize: 10,
              color: t.ink50,
              marginTop: 2,
              letterSpacing: '0.14em',
            }}
          >
            これまでの対話で AI から受けたフィードバック
          </div>
        </div>
        <div style={{ padding: '14px 24px 24px' }}>
          {a.diary.map((d, i) => {
            const moodColor = MOOD_COLOR[d.mood] ?? t.ink70
            return (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 1fr',
                  gap: 16,
                  padding: '16px 0',
                  borderTop: i === 0 ? 'none' : `1px solid ${t.ink12}`,
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: t.mono,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                    }}
                  >
                    {d.date}
                  </div>
                  <div
                    style={{
                      fontFamily: t.mono,
                      fontSize: 9,
                      color: moodColor,
                      letterSpacing: '0.16em',
                      marginTop: 4,
                      fontWeight: 700,
                    }}
                  >
                    ● {(d.mood || '').toUpperCase()}
                  </div>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: t.ink }}>{d.summary}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
