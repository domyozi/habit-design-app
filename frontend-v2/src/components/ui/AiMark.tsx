export const AiMark = ({ size = 10 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 10 10"
    fill="none"
    aria-hidden="true"
    style={{ flexShrink: 0 }}
  >
    <defs>
      <linearGradient id="ai-spark" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#7dd3fc" />
        <stop offset="100%" stopColor="#a78bfa" />
      </linearGradient>
    </defs>
    {/* 4-pointed sparkle ✦ */}
    <path
      d="M5 1 L5.55 4.45 L9 5 L5.55 5.55 L5 9 L4.45 5.55 L1 5 L4.45 4.45 Z"
      fill="url(#ai-spark)"
    />
  </svg>
)
