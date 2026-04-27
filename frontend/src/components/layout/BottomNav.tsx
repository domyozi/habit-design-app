/**
 * フローティング底部ナビゲーション
 * 全認証済み画面で共通表示されるグローバルナビゲーション
 *
 * - Dashboard.tsx からのデザイン抽出（ガラスモーフィズム）
 * - アクティブ状態: text-emerald-400 + 下部インジケータドット
 * - 位置: fixed bottom-6 中央寄せ
 */
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Star, BarChart2, Settings } from 'lucide-react'

const NAV_ITEMS = [
  { to: '/', label: 'ホーム', icon: LayoutDashboard },
  { to: '/wanna-be', label: 'Wanna Be', icon: Star },
  { to: '/weekly-review', label: 'レビュー', icon: BarChart2 },
  { to: '/settings', label: '設定', icon: Settings },
]

export const BottomNav = () => (
  <nav
    className="z-50 mx-auto mt-6 w-full max-w-2xl px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
    aria-label="メインナビゲーション"
  >
    <ul
      className="mx-auto flex max-w-sm items-center justify-around rounded-3xl p-1.5 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8),0_0_20px_-5px_rgba(52,211,153,0.15)]"
      style={{
        background: 'rgba(2,6,23,0.65)',
        backdropFilter: 'blur(32px)',
        WebkitBackdropFilter: 'blur(32px)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <li key={to}>
          <NavLink
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `relative flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-[10px] font-medium transition-all ${
                isActive
                  ? 'bg-white/[0.06] text-emerald-400'
                  : 'text-slate-500 hover:text-slate-300'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={20} />
                <span>{label}</span>
                {isActive && (
                  <span className="absolute bottom-1 h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_4px_#34d399]" />
                )}
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  </nav>
)
