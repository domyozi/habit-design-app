import type { Theme } from '@/lib/theme'
import type { Habit } from '@/lib/mockData'

interface Props {
  habit: Habit
  theme: Theme
  height?: number
}

export function MiniGraph({ habit, theme: t, height = 28 }: Props) {
  const s = habit.series ?? []

  if (habit.type === 'boolean' || habit.type === 'time-target') {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${s.length}, 1fr)`,
          gap: 1.5,
          height,
          alignItems: 'center',
        }}
      >
        {s.map((v, i) => {
          const filled = habit.type === 'boolean' ? v === 1 : v != null
          return (
            <div
              key={i}
              style={{
                width: '100%',
                aspectRatio: '1',
                maxHeight: 8,
                background: filled ? (habit.lagging ? t.accent : t.ink) : t.ink12,
              }}
            />
          )
        })}
      </div>
    )
  }

  const numeric = s.filter((x): x is number => x != null && !Number.isNaN(x))
  const max = Math.max(...numeric, 1)
  const min = Math.min(...numeric, max)
  const range = max - min || 1

  if (habit.type === 'score' || habit.type === 'weight') {
    const pts = s
      .map((v, i) => {
        if (v == null) return null
        const x = (i / Math.max(s.length - 1, 1)) * 100
        const y = 100 - ((v - min) / range) * 90 - 5
        return `${x},${y}`
      })
      .filter(Boolean)
      .join(' ')
    return (
      <svg width="100%" height={height} viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline
          points={pts}
          fill="none"
          stroke={t.ink}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        {s.map((v, i) => {
          if (v == null) return null
          const x = (i / Math.max(s.length - 1, 1)) * 100
          const y = 100 - ((v - min) / range) * 90 - 5
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="1.5"
              fill={t.accent}
              vectorEffect="non-scaling-stroke"
            />
          )
        })}
      </svg>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, height }}>
      {s.map((v, i) => {
        const empty = v == null || v === 0
        const hh = empty ? 3 : Math.max(3, ((v as number) / max) * height)
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: hh,
              background: empty ? t.ink12 : habit.lagging ? t.accent : t.ink,
            }}
          />
        )
      })}
    </div>
  )
}
