interface BrandMarkProps {
  compact?: boolean
  className?: string
}

const Glyph = () => (
  <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/[0.10] bg-[linear-gradient(180deg,rgba(17,24,39,0.94),rgba(9,14,24,0.98))] shadow-[0_14px_28px_rgba(0,0,0,0.28)]">
    <div className="absolute inset-[7px] rounded-[13px] border border-white/[0.05] bg-white/[0.015]" />
    <svg
      aria-hidden="true"
      viewBox="0 0 48 48"
      className="relative z-10 h-7 w-7"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M15 24h18"
        stroke="#9fd3ff"
        strokeWidth="2.3"
        strokeLinecap="round"
      />
      <path
        d="M15 18h10"
        stroke="#d8c9ff"
        strokeWidth="2.3"
        strokeLinecap="round"
      />
      <path d="M24 14v20" stroke="rgba(255,255,255,0.72)" strokeWidth="1.9" strokeLinecap="round" />
      <circle cx="24" cy="24" r="3.2" fill="#f2f4f8" />
    </svg>
  </div>
)

export const BrandMark = ({
  compact = false,
  className = '',
}: BrandMarkProps) => {
  if (compact) {
    return (
      <div className={className}>
        <Glyph />
      </div>
    )
  }

  return (
    <div className={['flex items-center gap-3', className].join(' ').trim()}>
      <Glyph />
      <div>
        <p className="text-sm font-semibold tracking-[0.02em] text-white/90">Daily OS</p>
      </div>
    </div>
  )
}
