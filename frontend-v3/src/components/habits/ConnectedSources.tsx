import type { Theme } from '@/lib/theme'
import { MonoLabel } from '@/components/today/MonoLabel'

interface Props {
  theme: Theme
}

const SOURCES = [
  { l: 'Apple Watch', g: '⌚', s: '起床・睡眠・心拍', on: true },
  { l: 'Nike Run',    g: '🏃', s: 'ラン距離・ペース', on: true },
  { l: 'Health',      g: '♥',  s: '体重・歩数',       on: true },
  { l: 'Strava',      g: '◈',  s: 'サイクリング',     on: false },
  { l: 'Linear',      g: '△',  s: 'タスク完了',       on: false },
  { l: 'Notion',      g: '◰',  s: 'ノート連携',       on: false },
]

export function ConnectedSources({ theme: t }: Props) {
  return (
    <div style={{ padding: '18px 22px 12px', borderBottom: `1px solid ${t.ink12}` }}>
      <MonoLabel theme={t} color={t.accent}>
        CONNECTED SOURCES
      </MonoLabel>
      <div style={{ fontSize: 11, color: t.ink70, marginTop: 6, lineHeight: 1.5 }}>
        外部デバイス・アプリと連携。<strong>自動取込</strong> なら手間ゼロで状態が更新されます。
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 6,
          marginTop: 12,
        }}
      >
        {SOURCES.map((s) => (
          <div
            key={s.l}
            style={{
              padding: '8px 10px',
              border: `1px solid ${s.on ? t.line : t.ink12}`,
              background: s.on ? t.paper : 'transparent',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>
                {s.g} {s.l}
              </div>
              <div
                style={{
                  fontFamily: t.mono,
                  fontSize: 9,
                  color: t.ink50,
                  letterSpacing: '0.1em',
                  marginTop: 2,
                }}
              >
                {s.s}
              </div>
            </div>
            <span
              style={{
                fontFamily: t.mono,
                fontSize: 8,
                fontWeight: 700,
                padding: '2px 5px',
                letterSpacing: '0.14em',
                background: s.on ? t.accent : 'transparent',
                color: s.on ? t.paper : t.ink50,
                border: s.on ? 'none' : `1px solid ${t.ink12}`,
              }}
            >
              {s.on ? 'ON' : '+ ADD'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
