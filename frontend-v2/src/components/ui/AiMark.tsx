/** AI機能ボタンに付ける小さなスパークルバッジ */
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
    {/* 縦棒 */}
    <path d="M5 1 L5 9" stroke="url(#ai-spark)" strokeWidth="1.2" strokeLinecap="round" />
    {/* 横棒 */}
    <path d="M1 5 L9 5" stroke="url(#ai-spark)" strokeWidth="1.2" strokeLinecap="round" />
    {/* 斜め右上 */}
    <path d="M2.5 2.5 L7.5 7.5" stroke="url(#ai-spark)" strokeWidth="0.9" strokeLinecap="round" />
    {/* 斜め右下 */}
    <path d="M7.5 2.5 L2.5 7.5" stroke="url(#ai-spark)" strokeWidth="0.9" strokeLinecap="round" />
  </svg>
)
