interface HeaderProps {
  boss?: string | null
  bossCompleted?: boolean
  onBossClick?: () => void
  onSetupClick?: () => void
}

export const Header = ({ boss, bossCompleted, onBossClick, onSetupClick }: HeaderProps) => (
  <header className="border-b border-[#9fb4d1]/10 bg-[#07111d]/90 px-4 py-3 backdrop-blur-xl" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
    <div className="flex items-center justify-between gap-2 rounded-2xl border border-[#7dd3fc]/18 bg-[#071828]/80 px-3 py-2.5">
      <div>
        <p className={['text-sm', bossCompleted ? 'text-white/45 line-through' : 'text-white/85'].join(' ')}>
          {boss ?? '未設定'}
        </p>
      </div>
      <button
        type="button"
        onClick={!boss && !bossCompleted ? onSetupClick ?? onBossClick : onBossClick}
        className={[
          'shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em]',
          bossCompleted
            ? 'border-[#34d399]/30 bg-[#34d399]/12 text-[#7ef0be]'
            : boss
              ? 'border-[#7dd3fc]/30 bg-[#7dd3fc]/10 text-[#9ddfff]'
              : 'border-[#7dd3fc]/20 bg-[#7dd3fc]/8 text-[#8ed8ff]/70',
        ].join(' ')}
      >
        {bossCompleted
          ? 'Closed'
          : boss
            ? 'Open'
            : 'Setup'}
      </button>
    </div>
  </header>
)
