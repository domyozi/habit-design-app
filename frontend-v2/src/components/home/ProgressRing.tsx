interface ProgressRingProps {
  label: string
  color: string
  target: number
  actual: number
  best?: number
  size?: number
}

// SVG viewBox="0 0 36 36"、中心(18,18)、半径14
const RADIUS = 14
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const pct = (value: number, max: number) =>
  max > 0 ? Math.min(1, value / max) : 0

export const ProgressRing = ({
  label,
  color,
  target,
  actual,
  best,
  size = 80,
}: ProgressRingProps) => {
  const actualPct  = pct(actual, target)
  const bestPct    = best ? pct(best, target) : 0
  const isComplete = actual >= target

  const offset = (p: number) => CIRCUMFERENCE * (1 - p)

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div style={{ width: size, height: size }} className="relative">
        <svg viewBox="0 0 36 36" width={size} height={size} className="-rotate-90">
          {/* トラック */}
          <circle
            cx="18" cy="18" r={RADIUS}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="3"
          />
          {/* ベスト（外周薄い線） */}
          {best != null && best > 0 && (
            <circle
              cx="18" cy="18" r={RADIUS}
              fill="none"
              stroke={color}
              strokeOpacity="0.2"
              strokeWidth="3"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={offset(bestPct)}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          )}
          {/* 実績（メイン） */}
          <circle
            cx="18" cy="18" r={RADIUS}
            fill="none"
            stroke={isComplete ? '#22c55e' : color}
            strokeWidth="3"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset(actualPct)}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>

        {/* 中央テキスト */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {isComplete ? (
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7ef0be]">
              Done
            </span>
          ) : (
            <>
              <span className="text-sm font-bold leading-none" style={{ color }}>
                {actual}
              </span>
              <span className="text-[9px] text-[#555] leading-none mt-0.5">
                /{target}
              </span>
            </>
          )}
        </div>
      </div>

      <span className="text-[11px] text-[#777]">{label}</span>
    </div>
  )
}
