import type { Theme } from '@/lib/theme'

interface Props {
  theme: Theme
  series: (number | null)[]
  target: number
}

export function CumulativeChart({ theme: t, series, target }: Props) {
  let acc = 0
  const cum = series.map((v) => (acc += v ?? 0))
  const max = Math.max(target, ...cum)
  const yOf = (v: number) => 100 - (v / max) * 86 - 7
  const pts = cum
    .map((v, i) => `${(i / Math.max(cum.length - 1, 1)) * 100},${yOf(v)}`)
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
        <polyline points={`0,100 ${pts} 100,100`} fill={t.ink} fillOpacity="0.08" stroke="none" />
        <polyline
          points={pts}
          fill="none"
          stroke={t.ink}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
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
        <span>累積</span>
        <span style={{ color: t.accent }}>—— 目標 ¥{target.toLocaleString()} ——</span>
      </div>
    </div>
  )
}
