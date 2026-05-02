import type { CSSProperties, ReactNode } from 'react'
import type { Theme } from '@/lib/theme'

export function MonoLabel({
  theme: t,
  color,
  style,
  children,
}: {
  theme: Theme
  color?: string
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <span
      style={{
        fontFamily: t.mono,
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: color || t.ink50,
        ...style,
      }}
    >
      {children}
    </span>
  )
}
