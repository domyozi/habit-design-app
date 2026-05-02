import type { Theme } from '@/lib/theme'
import type { Habit } from '@/lib/mockData'

interface Props {
  habit: Habit
  theme: Theme
}

export function TodayCell({ habit: h, theme: t }: Props) {
  const goal = h.goal
  const today = h.today
  const done = today.done
  const auto = today.viaAuto
  const photo = today.viaPhoto

  const valueDisplay = (): string => {
    switch (h.type) {
      case 'boolean':
        return done ? '✓' : '—'
      case 'time-target':
        return (today.value as string) || '—'
      case 'count':
        return `${today.value ?? 0} / ${goal.value}`
      case 'duration':
        return `${today.value ?? 0} / ${goal.value}m`
      case 'distance':
        return `${today.value ?? 0} / ${goal.value}km`
      case 'pages':
        return `${today.value ?? 0} / ${goal.value}p`
      case 'score':
        return `${today.value} → ${goal.value}`
      case 'weight':
        return `${today.value} → ${goal.value}kg`
      case 'currency':
        return `¥${(Number(today.value) || 0).toLocaleString()}`
      case 'words':
        return `${today.value ?? 0} / ${goal.value}`
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span
        style={{
          fontFamily: t.mono,
          fontSize: 13,
          fontWeight: 600,
          color: done ? t.ink : t.ink50,
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
        }}
      >
        {valueDisplay()}
      </span>
      {auto && (
        <span
          title="自動取込"
          style={{
            fontFamily: t.mono,
            fontSize: 8,
            fontWeight: 700,
            padding: '2px 5px',
            background: t.ink,
            color: t.paper,
            letterSpacing: '0.12em',
          }}
        >
          AUTO
        </span>
      )}
      {photo && (
        <span
          title="写真証明"
          style={{
            fontFamily: t.mono,
            fontSize: 8,
            fontWeight: 700,
            padding: '2px 5px',
            background: t.accent,
            color: t.paper,
            letterSpacing: '0.12em',
          }}
        >
          + PHOTO
        </span>
      )}
    </div>
  )
}
