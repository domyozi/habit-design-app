import type { Theme } from '@/lib/theme'
import { MonoLabel } from '@/components/today/MonoLabel'

interface Props {
  theme: Theme
}

export function XpEconomy({ theme: t }: Props) {
  const rules = [
    { l: 'チェックボックス（手動）',   xp: '+ BASE',       g: '✓',  c: t.ink70 },
    { l: '写真アップロード',           xp: '+ BASE × 1.5', g: '📷', c: t.accent },
    { l: '外部デバイス自動取込',       xp: '+ BASE × 1.3', g: '⌚', c: t.ink },
    { l: '連続ストリーク 7日+',        xp: '+ BONUS 50',   g: '△',  c: t.accent },
  ]

  return (
    <div style={{ padding: '18px 22px 14px', borderBottom: `1px solid ${t.ink12}` }}>
      <MonoLabel theme={t} color={t.accent}>
        XP · 行動の重み付け
      </MonoLabel>
      <div style={{ fontSize: 11, color: t.ink70, marginTop: 6, lineHeight: 1.55 }}>
        手間に応じて XP が変動します。証明が強いほど報酬が大きく。
      </div>
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {rules.map((r) => (
          <div
            key={r.l}
            style={{
              display: 'grid',
              gridTemplateColumns: '24px 1fr auto',
              gap: 10,
              padding: '7px 0',
              borderTop: `1px solid ${t.ink06}`,
              alignItems: 'center',
            }}
          >
            <span style={{ fontFamily: t.mono, fontSize: 13 }}>{r.g}</span>
            <span style={{ fontSize: 12 }}>{r.l}</span>
            <span
              style={{
                fontFamily: t.mono,
                fontSize: 10,
                fontWeight: 700,
                color: r.c,
                letterSpacing: '0.12em',
              }}
            >
              {r.xp}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
