import type { Theme } from '@/lib/theme'

interface Props {
  theme: Theme
  series: (number | null)[]
  target?: number
  baseline?: number
  inverted?: boolean
}

export function LineChart({ theme: t, series, target, baseline }: Props) {
  if (!series || !series.length) return null
  const all = [...series, target, baseline].filter((v): v is number => v != null)
  const max = Math.max(...all)
  const min = Math.min(...all)
  const range = max - min || 1
  const yOf = (v: number) => 100 - ((v - min) / range) * 86 - 7

  const valid = series
    .map((v, i) => (v == null ? null : `${(i / Math.max(series.length - 1, 1)) * 100},${yOf(v)}`))
    .filter(Boolean)
    .join(' ')

  return (
    <div>
      <svg
        width="100%"
        height="80"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{
          borderTop: `1px solid ${t.ink06}`,
          borderBottom: `1px solid ${t.ink06}`,
        }}
      >
        {target != null && (
          <line
            x1="0"
            x2="100"
            y1={yOf(target)}
            y2={yOf(target)}
            stroke={t.accent}
            strokeDasharray="2 2"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {baseline != null && (
          <line
            x1="0"
            x2="100"
            y1={yOf(baseline)}
            y2={yOf(baseline)}
            stroke={t.ink30}
            strokeDasharray="1 2"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <polyline
          points={valid}
          fill="none"
          stroke={t.ink}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        {series.map((v, i) =>
          v == null ? null : (
            <circle
              key={i}
              cx={(i / Math.max(series.length - 1, 1)) * 100}
              cy={yOf(v)}
              r="2"
              fill={t.accent}
              vectorEffect="non-scaling-stroke"
            />
          ),
        )}
      </svg>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 4,
          fontFamily: t.mono,
          fontSize: 9,
          color: t.ink50,
          letterSpacing: '0.1em',
        }}
      >
        <span>baseline {baseline}</span>
        <span style={{ color: t.accent }}>—— target {target} ——</span>
      </div>
    </div>
  )
}
