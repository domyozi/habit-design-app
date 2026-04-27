type SpinnerSize = 'sm' | 'md' | 'lg'

const sizeMap: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-9 w-9 border-[3px]',
}

interface SpinnerProps {
  size?: SpinnerSize
  tone?: 'light' | 'dark'
  className?: string
}

export const Spinner = ({
  size = 'md',
  tone = 'light',
  className = '',
}: SpinnerProps) => {
  const toneClass =
    tone === 'light'
      ? 'border-white/20 border-t-white'
      : 'border-slate-300 border-t-slate-900'

  return (
    <span
      aria-hidden="true"
      className={`inline-block animate-spin rounded-full ${sizeMap[size]} ${toneClass} ${className}`.trim()}
    />
  )
}

export default Spinner
