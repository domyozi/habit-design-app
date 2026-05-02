import type { Theme } from '@/lib/theme'

interface Props {
  theme: Theme
  title: string
  subtitle: string
}

export function PlaceholderPage({ theme: t, title, subtitle }: Props) {
  return (
    <div
      style={{
        height: '100%',
        padding: '48px 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div
        style={{
          fontFamily: t.mono,
          fontSize: 10,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: t.ink50,
        }}
      >
        Sprint 0 placeholder
      </div>
      <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.01em' }}>{title}</div>
      <div style={{ fontSize: 14, color: t.ink70, maxWidth: 720, lineHeight: 1.6 }}>{subtitle}</div>
      <div
        style={{
          marginTop: 24,
          padding: '16px 20px',
          border: `1px dashed ${t.ink12}`,
          background: `${t.accent}08`,
          fontFamily: t.mono,
          fontSize: 11,
          color: t.ink50,
          letterSpacing: '0.06em',
        }}
      >
        Phase: <strong style={{ color: t.accent }}>{t.phase}</strong> · Active window {t.window} ·
        Accent {t.accent}
      </div>
    </div>
  )
}
