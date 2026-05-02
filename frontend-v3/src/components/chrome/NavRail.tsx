import { NavLink } from 'react-router-dom'
import type { Theme } from '@/lib/theme'

export const NAV = [
  { id: 'today',    path: '/today',    label: 'TODAY',    key: '1' },
  { id: 'flow',     path: '/flow',     label: 'FLOW',     key: '2' },
  { id: 'habits',   path: '/habits',   label: 'HABITS',   key: '3' },
  { id: 'signals',  path: '/signals',  label: 'SIGNALS',  key: '4' },
  { id: 'memory',   path: '/memory',   label: 'MEMORY',   key: '5' },
  { id: 'notes',    path: '/notes',    label: 'NOTES',    key: '6' },
  { id: 'calendar', path: '/calendar', label: 'CALENDAR', key: '7' },
] as const

interface Props {
  theme: Theme
}

export function NavRail({ theme: t }: Props) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      {NAV.map((n, idx) => (
        <NavLink
          key={n.id}
          to={n.path}
          style={({ isActive }) => ({
            padding: '0 14px',
            height: 52,
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            textDecoration: 'none',
            borderLeft: `1px solid ${t.ink12}`,
            borderRight: idx === NAV.length - 1 ? `1px solid ${t.ink12}` : 'none',
            fontFamily: t.mono,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: '0.14em',
            color: isActive ? t.ink : t.ink50,
            background: isActive ? t.paperWarm : 'transparent',
            position: 'relative',
            cursor: 'pointer',
          })}
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: -1,
                    height: 2,
                    background: t.accent,
                  }}
                />
              )}
              <span style={{ color: isActive ? t.accent : t.ink30, fontSize: 9 }}>[{n.key}]</span>
              {n.label}
            </>
          )}
        </NavLink>
      ))}
    </div>
  )
}
