import type { Theme } from '@/lib/theme'
import { formatTime } from '@/lib/theme'

interface Props {
  theme: Theme
  hour: number
}

export function HorizonBand({ theme: t, hour }: Props) {
  const sunLeft = `calc(22px + ${(hour / 24) * 100}% - 7px)`
  const nowLeft = `calc(22px + ${(hour / 24) * 100}%)`
  return (
    <div
      style={{
        position: 'relative',
        height: 96,
        borderBottom: `1px solid ${t.line}`,
        background: `linear-gradient(180deg, ${t.paper} 0%, ${t.paperWarm} 100%)`,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* hour ticks */}
      <div
        style={{
          position: 'absolute',
          left: 22,
          right: 22,
          top: 0,
          bottom: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(24, 1fr)',
        }}
      >
        {Array.from({ length: 24 }).map((_, i) => {
          const isHr = i % 3 === 0
          const isNow = i === Math.floor(hour)
          return (
            <div
              key={i}
              style={{
                position: 'relative',
                borderLeft: i === 0 ? 'none' : `1px solid ${isHr ? t.ink12 : t.ink06}`,
              }}
            >
              {isHr && (
                <div
                  style={{
                    position: 'absolute',
                    top: 6,
                    left: 4,
                    fontFamily: t.mono,
                    fontSize: 9,
                    color: isNow ? t.ink : t.ink30,
                    fontWeight: isNow ? 700 : 400,
                    letterSpacing: '0.04em',
                  }}
                >
                  {String(i).padStart(2, '0')}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {/* horizon line */}
      <div style={{ position: 'absolute', left: 22, right: 22, top: '60%', height: 1, background: t.line }} />
      {/* sun */}
      <div
        style={{
          position: 'absolute',
          left: sunLeft,
          top: '60%',
          transform: 'translateY(-50%)',
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: t.accent,
          boxShadow: `0 0 0 4px ${t.paper}, 0 0 0 5px ${t.accent}`,
          zIndex: 3,
        }}
      />
      {/* now line */}
      <div
        style={{
          position: 'absolute',
          left: nowLeft,
          top: 0,
          bottom: 0,
          width: 1,
          background: `${t.accent}66`,
        }}
      />
      {/* phase label */}
      <div style={{ position: 'absolute', left: 22, top: 14, display: 'flex', alignItems: 'baseline', gap: 16 }}>
        <div
          style={{
            fontFamily: t.mono,
            fontSize: 30,
            fontWeight: 300,
            letterSpacing: '-0.02em',
            lineHeight: 1,
          }}
        >
          {formatTime(hour, (hour % 1) * 60)}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>
            {t.greeting}。{t.label}。
          </div>
          <div
            style={{
              fontFamily: t.mono,
              fontSize: 9,
              color: t.ink50,
              marginTop: 2,
              letterSpacing: '0.14em',
            }}
          >
            ACTIVE WINDOW · {t.window}
          </div>
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          right: 22,
          bottom: 6,
          fontFamily: t.mono,
          fontSize: 9,
          color: t.ink50,
          letterSpacing: '0.14em',
        }}
      >
        DAY · {String(Math.round((hour / 24) * 100)).padStart(2, '0')}%
      </div>
    </div>
  )
}
