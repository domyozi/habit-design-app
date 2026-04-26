import type { TabId } from '@/types'

interface Tab {
  id: TabId
  label: string
  icon: string
}

const TABS: Tab[] = [
  { id: 'morning',  label: '朝',       icon: '🌅' },
  { id: 'evening',  label: '夜',       icon: '🌙' },
  { id: 'monthly',  label: '月次',     icon: '📅' },
  { id: 'wanna-be', label: 'Wanna Be', icon: '🔥' },
  { id: 'report',   label: '日報',     icon: '📝' },
]

interface TabBarProps {
  active: TabId
  onChange: (id: TabId) => void
}

export const TabBar = ({ active, onChange }: TabBarProps) => (
  <nav className="flex border-b border-white/[0.08] bg-[#0a0a0a] sticky top-0 z-50">
    {TABS.map(tab => (
      <button
        key={tab.id}
        type="button"
        onClick={() => onChange(tab.id)}
        className={[
          'flex-1 py-3 text-xs font-medium transition-colors relative',
          active === tab.id
            ? 'text-white'
            : 'text-[#555] hover:text-[#999]',
        ].join(' ')}
      >
        <span className="block text-base leading-none mb-0.5">{tab.icon}</span>
        {tab.label}
        {active === tab.id && (
          <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#f59e0b]" />
        )}
      </button>
    ))}
  </nav>
)
