import type { Theme } from '@/lib/theme'
import { APP } from '@/lib/mockData'
import { MonoLabel } from '@/components/today/MonoLabel'

interface Props {
  theme: Theme
}

export function AiSuggestions({ theme: t }: Props) {
  return (
    <div style={{ padding: '18px 22px' }}>
      <MonoLabel theme={t} color={t.accent}>
        AI SUGGESTIONS · FROM JOURNAL
      </MonoLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
        {APP.suggested.map((s) => (
          <div
            key={s.id}
            style={{
              padding: '12px 14px',
              border: `1px solid ${t.line}`,
              background: t.paper,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{s.label}</span>
              <span
                style={{
                  fontFamily: t.mono,
                  fontSize: 9,
                  color: t.accent,
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                }}
              >
                ● {Math.round(s.confidence * 100)}%
              </span>
            </div>
            <div
              style={{
                fontSize: 11,
                color: t.ink70,
                lineHeight: 1.5,
                marginBottom: 8,
              }}
            >
              {s.why}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span
                style={{
                  fontFamily: t.mono,
                  fontSize: 9,
                  color: t.ink50,
                  letterSpacing: '0.12em',
                }}
              >
                SOURCE · {s.source.toUpperCase()}
              </span>
              <button
                style={{
                  padding: '4px 10px',
                  fontFamily: t.mono,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  background: t.accent,
                  color: t.paper,
                  border: `1px solid ${t.accent}`,
                  cursor: 'pointer',
                }}
              >
                + ADOPT
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
