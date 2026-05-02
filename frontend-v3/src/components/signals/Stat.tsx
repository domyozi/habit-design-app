import type { Theme } from '@/lib/theme'

interface Props {
  theme: Theme
  k: string
  v: string | number
  sub?: string
  on?: boolean
}

export function Stat({ theme: t, k, v, sub, on }: Props) {
  return (
    <div>
      <div
        style={{
          fontFamily: t.mono,
          fontSize: 9,
          color: t.ink50,
          letterSpacing: '0.14em',
        }}
      >
        {k.toUpperCase()}
      </div>
      <div
        style={{
          fontFamily: t.mono,
          fontSize: 22,
          fontWeight: 300,
          letterSpacing: '-0.02em',
          color: on ? t.accent : t.ink,
          marginTop: 2,
        }}
      >
        {v}
      </div>
      {sub && (
        <div
          style={{
            fontFamily: t.mono,
            fontSize: 9,
            color: t.ink50,
            letterSpacing: '0.1em',
            marginTop: 2,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  )
}
