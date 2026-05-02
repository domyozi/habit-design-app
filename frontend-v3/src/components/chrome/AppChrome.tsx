import type { ReactNode } from 'react'
import type { Theme } from '@/lib/theme'
import { HorizonBand } from './HorizonBand'
import { NavRail } from './NavRail'

interface Props {
  theme: Theme
  hour: number
  children: ReactNode
  hideHorizon?: boolean
}

export function AppChrome({ theme: t, hour, children, hideHorizon }: Props) {
  const today = new Date()
  const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')} ${'日月火水木金土'[today.getDay()]}`

  const wash = `radial-gradient(ellipse 100% 60% at 50% 0%, ${t.accent}10, transparent 60%),
                linear-gradient(180deg, ${t.paper} 0%, ${t.paperWarm} 100%)`

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: t.paper,
        backgroundImage: wash,
        backgroundAttachment: 'local',
        color: t.ink,
        fontFamily: t.sans,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '210px 1fr auto',
          alignItems: 'center',
          padding: '0 22px',
          height: 52,
          borderBottom: `1px solid ${t.line}`,
          background: t.paper,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 22,
              height: 22,
              border: `1.5px solid ${t.line}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ width: 7, height: 7, background: t.accent }} />
          </div>
          <div>
            <div
              style={{
                fontFamily: t.mono,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.12em',
              }}
            >
              DAILY.OS
            </div>
            <div
              style={{
                fontFamily: t.mono,
                fontSize: 9,
                color: t.ink50,
                letterSpacing: '0.16em',
              }}
            >
              ai-native · {t.phase}
            </div>
          </div>
        </div>

        <NavRail theme={t} />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            fontFamily: t.mono,
            fontSize: 11,
            color: t.ink70,
          }}
        >
          <span>
            <span style={{ color: t.ink30 }}>SYS </span>
            {dateStr}
          </span>
          <div
            style={{
              padding: '4px 10px',
              background: t.ink,
              color: t.paper,
              fontSize: 10,
              letterSpacing: '0.14em',
              fontWeight: 700,
            }}
          >
            {t.phase.toUpperCase()}
          </div>
        </div>
      </div>

      {!hideHorizon && <HorizonBand theme={t} hour={hour} />}

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', position: 'relative' }}>
        {children}
      </div>
    </div>
  )
}
