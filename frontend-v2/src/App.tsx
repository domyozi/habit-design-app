import { useState, useRef, useEffect, useMemo, lazy, Suspense } from 'react'
import { CalendarPanel } from '@/components/calendar/CalendarPanel'
import { countMonthlyChecks, useBossStorage, useDailyStorage, useLocalStorage, useMonthlyTargets, useTodayStorage, todayKey, useOpsStorage, type OpsTask } from '@/lib/storage'
import { useTodoDefinitions } from '@/lib/todos'
import { useAuth } from '@/hooks/useAuth'
import { AuthPage } from '@/pages/AuthPage'
import { PrivacyPage } from '@/pages/PrivacyPage'
import { Header } from '@/components/ui/Header'
import { BrandMark } from '@/components/ui/BrandMark'
import { BottomNav } from '@/components/layout/BottomNav'
import { MorningTab } from '@/components/tabs/MorningTab'
import { EveningTab } from '@/components/tabs/EveningTab'
import { HomePage } from '@/pages/HomePage'
const MonthlyTab  = lazy(() => import('@/components/tabs/MonthlyTab').then(m => ({ default: m.MonthlyTab })))
const WannaBeTab  = lazy(() => import('@/components/tabs/WannaBeTab').then(m => ({ default: m.WannaBeTab })))
const SettingsPage  = lazy(() => import('@/pages/SettingsPage').then(m => ({ default: m.SettingsPage })))
const NotesPage     = lazy(() => import('@/pages/NotesPage').then(m => ({ default: m.NotesPage })))
const NotesFullPage = lazy(() => import('@/pages/NotesFullPage').then(m => ({ default: m.NotesFullPage })))
const HealthTab     = lazy(() => import('@/components/tabs/HealthTab').then(m => ({ default: m.HealthTab })))
import { DateNav } from '@/components/ui/DateNav'
import { CoachPanel } from '@/components/ai/CoachPanel'
import { TaskListPanel } from '@/components/ai/TaskListPanel'
import { PrimaryTargetEditor, type TaskApplyMode } from '@/components/ui/PrimaryTargetEditor'
import { buildHomeCoachSnapshot, buildIdentityCoachSnapshot, buildMonthlyCoachSnapshot, buildSettingsCoachSnapshot, type CoachAction } from '@/lib/coach'
import { useUserContextRoot, UserContextCtx } from '@/lib/user-context'
import { saveJournalEntry, fetchHealthSummary } from '@/lib/api'
import { createTodoId } from '@/lib/todos'
import { getNavItems } from '@/lib/lang'
import type { JournalBriefResult } from '@/lib/ai'
import type { TabId } from '@/types'

const WORKSPACE_HABITS = [
  { id: 'early-rise', label: '早起き' },
  { id: 'training', label: '筋トレ' },
  { id: 'english', label: '英語' },
  { id: 'cardio', label: '有酸素' },
] as const

const MenuGlyph = ({ color }: { color: string }) => (
  <span
    aria-hidden="true"
    className="mt-0.5 block h-2.5 w-2.5 rounded-full border"
    style={{ borderColor: `${color}66`, backgroundColor: `${color}1A` }}
  />
)

const getCurrentPeriod = (): 'morning' | 'evening' | null => {
  const h = new Date().getHours()
  if (h >= 4 && h < 12) return 'morning'
  if (h >= 18) return 'evening'
  return null
}

const useCurrentPeriod = () => {
  const [period, setPeriod] = useState<'morning' | 'evening' | null>(getCurrentPeriod)
  useEffect(() => {
    const interval = setInterval(() => setPeriod(getCurrentPeriod()), 60_000)
    return () => clearInterval(interval)
  }, [])
  return period
}

const useIsDesktop = () => {
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1180)

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1180)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return isDesktop
}


const DesktopRail = ({
  active,
  onChange,
  currentPeriod,
  collapsed,
  onToggleCollapse,
  morningDone,
  eveningDone,
  lang,
  userEmail,
  healthConnected,
  onSignOut,
}: {
  active: TabId
  onChange: (id: TabId) => void
  currentPeriod?: 'morning' | 'evening' | null
  collapsed?: boolean
  onToggleCollapse?: () => void
  morningDone?: boolean
  eveningDone?: boolean
  lang?: import('@/lib/lang').AppLang
  userEmail?: string
  onSignOut?: () => void
  healthConnected?: boolean
}) => {
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const navItems = getNavItems(lang ?? 'ja').filter(i => i.id !== 'health' || healthConnected)
  const initial = userEmail?.[0]?.toUpperCase() ?? '?'

  // 収納時は 0px 幅の placeholder のみ（フローティングタブは App 側で管理）
  if (collapsed) {
    return <aside className="hidden lg:block overflow-hidden" style={{ width: 0, minWidth: 0 }} />
  }

  return (
    <aside className="hidden lg:flex lg:flex-col lg:border-r lg:border-white/[0.06] lg:bg-[#07111d]/88 lg:backdrop-blur-xl">
      <div className="border-b border-white/[0.06] px-5 py-6">
        <BrandMark />
      </div>
      <div className="flex-1 space-y-2 px-3 py-4">
        {navItems.map(item => {
          const isActive = active === item.id || (item.id === 'monthly' && active === 'report')
          const isPeriodMatch =
            (currentPeriod === 'morning' && item.id === 'morning') ||
            (currentPeriod === 'evening' && item.id === 'evening')
          const isDone =
            (item.id === 'evening' && eveningDone) ||
            (item.id === 'morning' && morningDone)
          const showNudge = isPeriodMatch && !isActive && !isDone
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={[
                'w-full rounded-2xl border px-4 py-3 text-left transition-colors',
                isActive
                  ? 'border-white/[0.12] bg-white/[0.05]'
                  : showNudge
                    ? 'border-[#7dd3fc]/20 bg-[#7dd3fc]/[0.03]'
                    : 'border-transparent bg-transparent hover:border-white/[0.06] hover:bg-white/[0.03]',
              ].join(' ')}
              style={showNudge ? { animation: 'time-nudge 2.4s ease-in-out infinite' } : undefined}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-base" style={{ color: `${item.color}cc` }}>{item.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-white/88">{item.label}</p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em]" style={{ color: `${item.color}cc` }}>{item.note}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {showNudge && (
                    <span className="h-1.5 w-1.5 rounded-full bg-[#7dd3fc]" style={{ animation: 'time-nudge 1.2s ease-in-out infinite' }} />
                  )}
                  <MenuGlyph color={item.color} />
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* ── フッター: ユーザーメニュー + 収納ボタン ─── */}
      <div className="border-t border-white/[0.06] px-3 py-3 space-y-2">
        {/* ユーザーメニュー */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setUserMenuOpen(p => !p)}
            className="flex w-full items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:border-white/[0.12] hover:bg-white/[0.06]"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#7dd3fc]/20 text-xs font-bold text-[#7dd3fc]">
              {initial}
            </span>
            <span className="flex-1 truncate text-xs text-white/50">{userEmail ?? 'アカウント'}</span>
            <span className="text-[10px] text-white/30">⋯</span>
          </button>

          {userMenuOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-full overflow-hidden rounded-xl border border-white/[0.12] bg-[#07111d] shadow-2xl">
              <div className="border-b border-white/[0.06] px-4 py-3">
                <p className="text-[10px] text-white/36 truncate">{userEmail}</p>
              </div>
              <div className="p-1.5 space-y-0.5">
                <button
                  type="button"
                  onClick={() => { onChange('settings'); setUserMenuOpen(false) }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-white/70 hover:bg-white/[0.06] transition-colors"
                >
                  <span className="text-base">⚙</span> 設定
                </button>
                <button
                  type="button"
                  onClick={() => { onSignOut?.(); setUserMenuOpen(false) }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-red-400/70 hover:bg-red-500/[0.06] transition-colors"
                >
                  <span className="text-base">↩</span> ログアウト
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 収納ボタン */}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] py-2.5 text-xs text-white/36 transition-colors hover:border-white/[0.14] hover:text-white/70"
        >
          <span>‹</span>
          <span>サイドバーを収納</span>
        </button>
      </div>
    </aside>
  )
}

// その他メニュー（月次 / Wanna Be / 設定）
const MoreMenu = ({ onNavigate }: { onNavigate: (tab: TabId, date?: string) => void }) => (
  <div className="space-y-3 px-4 py-4">
    <div className="rounded-2xl border border-[#9fb4d1]/10 bg-[#07111d]/70 px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[#8da4c3]">Extended surfaces</p>
      <p className="mt-2 text-sm text-white/72">レビュー、長期目標、設定はここから開きます。</p>
    </div>
    {([
      { id: 'monthly',  label: '分析・レポート', note: '週次・月次・年次', color: '#38bdf8' },
      { id: 'wanna-be', label: 'Wanna Be', note: 'identity, long-horizon goals', color: '#f59e0b' },
      { id: 'settings', label: '設定・AI支援', note: 'todo definitions, AI setup', color: '#a78bfa' },
    ] as { id: TabId; label: string; note: string; color: string }[]).map(({ id, label, note, color }) => (
      <button key={id} type="button" onClick={() => onNavigate(id)}
        className="block w-full rounded-2xl border border-white/[0.08] bg-[#111827]/70 px-4 py-3 text-left">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white/88">{label}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.18em]" style={{ color: `${color}CC` }}>{note}</p>
          </div>
          <MenuGlyph color={color} />
        </div>
      </button>
    ))}
  </div>
)

// Hooks を全部使うメインアプリ本体（認証済み後のみレンダリング）
function MainApp() {
  const isDesktop = useIsDesktop()
  const currentPeriod = useCurrentPeriod()
  const { session, signOut } = useAuth()
  const [tab, setTab] = useState<TabId>('home')
  const [healthConnected, setHealthConnected] = useState(false)
  const { boss, setBoss, toggleCompleted } = useBossStorage()
  const [todoDefinitions, setTodoDefinitions] = useTodoDefinitions()
  const [currentOps, setOps] = useOpsStorage()
  const [userContext, updateUserContext] = useUserContextRoot()
  const [savedAiHabits] = useLocalStorage<unknown>('settings:ai:habits', null)
  const [goals] = useLocalStorage<Array<{ priority?: string; title?: string }>>('wannabe:goals', [])
  const [morningChecked, setMorningChecked] = useDailyStorage<string[]>('morning', 'checked', [])
  const [eveningChecked, setEveningChecked] = useDailyStorage<string[]>('evening', 'checked', [])
  const [morningJournal] = useTodayStorage<string>('morning:journal', '')
  const [showJournalEditor, setShowJournalEditor] = useState(false)
  const [targets] = useMonthlyTargets(
    Object.fromEntries(WORKSPACE_HABITS.map(habit => [habit.id, 0]))
  )
  const [morningDoneBanner, setMorningDoneBanner] = useState(false)
  const [eveningDoneBanner, setEveningDoneBanner] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  // ── Apple Health 接続確認（ログイン後1回だけ取得）──────────
  useEffect(() => {
    if (!session) return
    fetchHealthSummary()
      .then(s => { if (Object.keys(s.latest).length > 0) setHealthConnected(true) })
      .catch(() => {})
  }, [session])

  // ── 日付管理 ────────────────────────────────────────────────
  // currentDate: 実際の今日の日付（日またぎ検知・key リセット用）
  // viewDate: 閲覧中の日付（過去ナビ用、タブ切り替えで今日に戻る）
  const [currentDate, setCurrentDate] = useState(todayKey)
  const [viewDate, setViewDate] = useState(todayKey)

  useEffect(() => {
    // 1分ごとに日付変更を検知 → 日をまたいだらタブを強制リマウント
    const interval = setInterval(() => {
      const now = todayKey()
      setCurrentDate(prev => {
        if (prev !== now) {
          setViewDate(now) // 閲覧日付も今日にリセット
          return now
        }
        return prev
      })
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'instant' })
  }, [tab])

  // 日報生成: 各タブで localStorage 保存済み → monthly タブで表示
  const handleMorningReport = (_text: string) => {
    setTab('monthly')
  }

  const handleEveningReport = (_text: string) => {
    // 夜はレポートを保存するだけにして、明示的な完了操作を残す
  }

  const handleEveningComplete = () => {
    setEveningDoneBanner(true)
    setTab('home')
  }

  const bossValue = boss?.value ?? null
  const bossCompleted = boss?.completed ?? false
  const monthlyCounts = useMemo(() => countMonthlyChecks('morning:checked'), [])
  const activeTodoCount = todoDefinitions.filter(todo => todo.is_active).length
  const inactiveTodoCount = todoDefinitions.filter(todo => !todo.is_active).length
  const activeGoalCount = goals.filter(goal => goal.priority !== 'done').length
  const criticalGoalCount = goals.filter(goal => goal.priority === 'critical').length
  const todayTotal = todoDefinitions.filter(todo => todo.is_active && todo.timing === 'morning').length
  const completionRate = todayTotal > 0 ? Math.round((morningChecked.length / todayTotal) * 100) : 0
  const monthlyHabitData = WORKSPACE_HABITS.map(habit => ({
    ...habit,
    actual: monthlyCounts[habit.id] ?? 0,
    target: targets[habit.id] ?? 0,
  }))
  const topWins = [...monthlyHabitData]
    .sort((a, b) => (b.actual / Math.max(b.target, 1)) - (a.actual / Math.max(a.target, 1)))
    .slice(0, 2)
  const underTarget = monthlyHabitData
    .filter(habit => habit.target > 0 && habit.actual < habit.target)
    .sort((a, b) => ((a.actual / a.target) - (b.actual / b.target)))
    .slice(0, 2)

  const coachSnapshot = (() => {
    if (tab === 'home' || tab === 'morning' || tab === 'evening') {
      return buildHomeCoachSnapshot({
        completionRate,
        todayDone: morningChecked.length,
        todayTotal,
        hasBoss: Boolean(bossValue),
        bossCompleted,
        eveningCheckedCount: eveningChecked.length,
        userContext,
      })
    }
    if (tab === 'monthly' || tab === 'report') {
      return buildMonthlyCoachSnapshot({ topWins, underTarget, activeGoalCount, userContext })
    }
    if (tab === 'settings') {
      return buildSettingsCoachSnapshot({
        activeTodoCount,
        inactiveTodoCount,
        hasSavedSuggestion: Boolean(savedAiHabits),
        userContext,
      })
    }
    if (tab === 'wanna-be') {
      return buildIdentityCoachSnapshot({
        criticalCount: criticalGoalCount,
        activeCount: activeGoalCount,
        userContext,
      })
    }
    return buildSettingsCoachSnapshot({
      activeTodoCount,
      inactiveTodoCount,
      hasSavedSuggestion: Boolean(savedAiHabits),
      userContext,
    })
  })()

  // HomePage の onNavigate: date を渡すと viewDate も同時にセット（昨日カード用）
  const handleHomeNavigate = (id: TabId, date?: string) => {
    setViewDate(date ?? todayKey())
    setTab(id)
  }

  // BottomNavの「その他」タップで、既にmore以外のサブ画面にいれば more メニューへ
  const handleNavChange = (id: TabId) => {
    // タブを切り替えたら閲覧日付を今日に戻す
    setViewDate(todayKey())
    if (id === 'more') {
      setTab(tab === 'more' ? 'home' : 'more')
    } else {
      setTab(id)
    }
  }

  // BottomNavのアクティブ表示: monthly/wanna-be/report は "more" をハイライト
  const navActive: TabId = (['monthly', 'wanna-be', 'report', 'settings'] as TabId[]).includes(tab)
    ? 'more'
    : tab

  const handleCoachAction = (action: CoachAction) => {
    if (!action.tab) return
    setViewDate(todayKey())
    setTab(action.tab)
  }

  const applyJournalTasks = (tasks: JournalBriefResult['tasks']) => {
    if (tasks.length > 0) {
      setTodoDefinitions(prev => {
        const existingLabels = new Set(prev.map(t => t.label.toLowerCase()))
        const newTasks = tasks
          .filter(t => !existingLabels.has(t.label.toLowerCase()))
          .map(t => ({
            id: createTodoId(t.label),
            label: t.label,
            section: (t.section === 'morning-must' ? 'identity' : 'system') as import('@/lib/todos').HabitCategory,
            timing: 'morning' as import('@/lib/todos').HabitTiming,
            isMust: t.section === 'morning-must',
            is_active: true,
          }))
        return [...prev, ...newTasks]
      })
    }
  }

  const handleJournalApply = ({ target, tasks, feedback, taskMode }: { target: string; tasks: JournalBriefResult['tasks']; feedback?: string; taskMode?: TaskApplyMode }) => {
    // user_context に goal_summary を自動更新
    if (target) {
      void updateUserContext({ goal_summary: target }).catch(() => {/* silent */})
    }

    // DB に非同期保存（失敗しても UI には影響させない）
    void saveJournalEntry({
      entry_date: todayKey(),
      raw_input: morningJournal,
      content: { primary_target: target, feedback: feedback ?? '', tasks },
    }).catch(() => {/* silent */})

    const applyTasks = (taskList: JournalBriefResult['tasks']) => {
      if (taskMode === 'today-only') {
        if (taskList.length === 0) return
        const existingTitles = new Set(currentOps.map(t => t.title.toLowerCase()))
        const newOps: OpsTask[] = taskList
          .filter(t => !existingTitles.has(t.label.toLowerCase()))
          .map(t => ({
            id: `ops-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            title: t.label,
            done: false,
            createdAt: new Date().toISOString(),
          }))
        setOps([...currentOps, ...newOps])
      } else {
        applyJournalTasks(taskList)
      }
    }

    if (target && bossValue && target !== bossValue) {
      setPendingTarget(target)
      setPendingTasks(tasks)
    } else {
      if (target) setBoss(target)
      applyTasks(tasks)
      setShowJournalEditor(false)
    }
  }

  const confirmPendingTarget = (accept: boolean) => {
    if (accept && pendingTarget) setBoss(pendingTarget)
    applyJournalTasks(pendingTasks)
    setPendingTarget(null)
    setPendingTasks([])
    setShowJournalEditor(false)
  }

  const renderTabContent = () => (
    <Suspense fallback={<div className="flex justify-center py-16"><div className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-[#7dd3fc]/60" /></div>}>
      <>
      {tab === 'home'     && (
        <HomePage
          onNavigate={handleHomeNavigate}
          morningDoneBanner={morningDoneBanner}
          eveningDoneBanner={eveningDoneBanner}
          onClearMorningBanner={() => setMorningDoneBanner(false)}
          onClearEveningBanner={() => setEveningDoneBanner(false)}
        />
      )}
      {(tab === 'morning' || tab === 'evening') && (
        <DateNav viewDate={viewDate} onViewDateChange={setViewDate} />
      )}
      {tab === 'morning' && (
        <MorningTab
          key={`${currentDate}:${viewDate}`}
          boss={bossValue}
          bossCompleted={bossCompleted}
          onBossToggle={toggleCompleted}
          onBossSet={setBoss}
          onGenerateReport={handleMorningReport}
          viewDate={viewDate}
        />
      )}
      {tab === 'evening'  && (
        <EveningTab
          key={`${currentDate}:${viewDate}`}
          onBossSet={setBoss}
          onGenerateReport={handleEveningReport}
          onComplete={handleEveningComplete}
          viewDate={viewDate}
        />
      )}
      {tab === 'monthly'  && <MonthlyTab />}
      {tab === 'wanna-be' && <WannaBeTab />}
      {tab === 'report'   && <MonthlyTab />}
      {tab === 'settings' && <SettingsPage />}
      {tab === 'notes'    && <NotesPage />}
      {tab === 'calendar' && (
        <div className="h-[calc(100svh-125px)] overflow-hidden">
          <CalendarPanel todoDefinitions={todoDefinitions} onClose={() => setTab('home')} mode="tab" />
        </div>
      )}
      {tab === 'health'   && <HealthTab />}
      {tab === 'more'     && <MoreMenu onNavigate={setTab} />}
      </>
    </Suspense>
  )

  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage<boolean>('ui:sidebar-collapsed', false)
  const [railCollapsed, setRailCollapsed] = useLocalStorage<boolean>('ui:rail-collapsed', false)
  const [pendingTarget, setPendingTarget] = useState<string | null>(null)
  const [pendingTasks, setPendingTasks] = useState<JournalBriefResult['tasks']>([])

  const eveningDone = eveningChecked.length > 0
  const morningDone = todayTotal > 0 && morningChecked.length >= todayTotal

  return (
    <UserContextCtx.Provider value={[userContext, updateUserContext]}>
    <div className="min-h-screen bg-[#05080d]">
      <div
        className="min-h-screen w-full lg:grid"
        style={{
          gridTemplateColumns: [
            railCollapsed ? '0px' : '248px',
            'minmax(0,1fr)',
            sidebarCollapsed ? '0px' : '360px',
          ].join(' '),
        }}
      >
        <DesktopRail
          active={tab}
          onChange={setTab}
          currentPeriod={currentPeriod}
          collapsed={railCollapsed}
          onToggleCollapse={() => setRailCollapsed(p => !p)}
          morningDone={morningDone}
          eveningDone={eveningDone}
          lang={(userContext?.lang ?? localStorage.getItem('settings:lang') ?? 'ja') as import('@/lib/lang').AppLang}
          userEmail={session?.user?.email}
          onSignOut={signOut}
          healthConnected={healthConnected}
        />

        <div className="min-w-0 lg:border-r lg:border-white/[0.06]">
          <Header
            boss={bossValue}
            bossCompleted={bossCompleted}
            onBossClick={() => setTab('evening')}
            onSetupClick={() => setShowJournalEditor(prev => !prev)}
          />
          {showJournalEditor && (
            <PrimaryTargetEditor
              journal={morningJournal}
              currentGoal={bossValue}
              identity={goals.find(g => g.priority === 'critical')?.title ?? goals.find(g => g.priority === 'high')?.title ?? ''}
              existingTaskLabels={todoDefinitions.filter(t => t.is_active).map(t => t.label)}
              onApply={handleJournalApply}
              onClose={() => setShowJournalEditor(false)}
            />
          )}
          {pendingTarget && (
            <div className="mx-4 mb-2 rounded-[20px] border border-[#7dd3fc]/20 bg-[#08111c]/95 px-5 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7dd3fc]">Primary Target を更新しますか？</p>
              <div className="mt-3 space-y-1.5">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 text-[10px] text-white/36 shrink-0">現在</span>
                  <p className="text-sm text-white/50 line-through">{bossValue}</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 text-[10px] text-[#7dd3fc] shrink-0">新規</span>
                  <p className="text-sm text-white/90">{pendingTarget}</p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => confirmPendingTarget(true)}
                  className="rounded-full border border-[#7dd3fc]/30 bg-[#7dd3fc]/10 px-4 py-1.5 text-xs font-semibold text-[#aee5ff] hover:bg-[#7dd3fc]/18"
                >
                  更新する
                </button>
                <button
                  type="button"
                  onClick={() => confirmPendingTarget(false)}
                  className="rounded-full border border-white/[0.08] px-4 py-1.5 text-xs text-white/40 hover:text-white/70"
                >
                  このままにする
                </button>
              </div>
            </div>
          )}

          <div ref={contentRef} className={['overflow-y-auto', isDesktop ? 'h-[calc(100svh-125px)]' : 'pb-20'].join(' ')}>
            {renderTabContent()}
            {!isDesktop && tab !== 'morning' && tab !== 'evening' && (
              <div className="px-4 pb-24">
                <CoachPanel snapshot={coachSnapshot} onAction={handleCoachAction} />
              </div>
            )}
          </div>
        </div>

        {/* 右パネル: 収納時は 0px プレースホルダー */}
        <div
          className={sidebarCollapsed ? '' : 'hidden lg:flex lg:flex-col lg:bg-[#05080d]'}
          style={sidebarCollapsed ? { width: 0, minWidth: 0, overflow: 'hidden', display: 'none' } : undefined}
        >
          {!sidebarCollapsed && (
            <div className="hidden lg:flex lg:flex-col sticky top-0 h-screen overflow-y-auto p-4 space-y-4">
              <div className="flex items-center justify-end mb-1">
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-xs text-white/36 transition-colors hover:border-white/[0.14] hover:text-white/70"
                >
                  <span>パネルを収納</span>
                  <span>›</span>
                </button>
              </div>
              <CoachPanel snapshot={coachSnapshot} onAction={handleCoachAction} />
              <TaskListPanel
                todoDefinitions={todoDefinitions}
                morningChecked={morningChecked}
                eveningChecked={eveningChecked}
                onToggle={(id, section) => {
                  const todo = todoDefinitions.find(t => t.id === id)
                  const isMorning = todo ? (todo.timing === 'morning' || todo.timing === 'anytime') : (section !== 'body' && section !== 'system')
                  if (isMorning) {
                    setMorningChecked(prev =>
                      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                    )
                  } else {
                    setEveningChecked(prev =>
                      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                    )
                  }
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── フローティング展開タブ（収納時のみ表示） ─── */}
      {railCollapsed && (
        <button
          type="button"
          onClick={() => setRailCollapsed(false)}
          className="fixed left-0 top-1/2 z-40 hidden -translate-y-1/2 lg:flex flex-col items-center justify-center gap-1 rounded-r-xl border-y border-r border-white/[0.12] bg-[#0d1825]/92 px-2 py-5 text-white/40 backdrop-blur-xl transition-colors hover:border-white/[0.22] hover:text-white/80"
          style={{ minHeight: 80 }}
          title="メニューを展開"
        >
          <span className="text-sm">›</span>
          <span className="text-[8px] font-semibold uppercase tracking-[0.2em] text-white/28" style={{ writingMode: 'vertical-rl' }}>MENU</span>
        </button>
      )}
      {sidebarCollapsed && (
        <button
          type="button"
          onClick={() => setSidebarCollapsed(false)}
          className="fixed right-0 top-1/2 z-40 hidden -translate-y-1/2 lg:flex flex-col items-center justify-center gap-1 rounded-l-xl border-y border-l border-white/[0.12] bg-[#0d1825]/92 px-2 py-5 text-white/40 backdrop-blur-xl transition-colors hover:border-white/[0.22] hover:text-white/80"
          style={{ minHeight: 80 }}
          title="パネルを展開"
        >
          <span className="text-[8px] font-semibold uppercase tracking-[0.2em] text-white/28" style={{ writingMode: 'vertical-rl' }}>PANEL</span>
          <span className="text-sm">‹</span>
        </button>
      )}

      <BottomNav
        active={navActive}
        onChange={handleNavChange}
        currentPeriod={currentPeriod}
        viewDate={viewDate}
        lang={userContext?.lang ?? 'ja'}
        onViewDateChange={date => {
          setViewDate(date)
          if (!(['morning', 'evening'] as string[]).includes(tab)) {
            setTab('morning')
          }
        }}
      />
    </div>
    </UserContextCtx.Provider>
  )
}

export default function App() {
  const { session, loading: authLoading } = useAuth()

  if (window.location.pathname === '/privacy') return <PrivacyPage />

  if (window.location.pathname === '/notes') {
    return (
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#05080d]"><div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-[#7dd3fc]/60" /></div>}>
        <NotesFullPage />
      </Suspense>
    )
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#05080d]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-[#7dd3fc]/60" />
      </div>
    )
  }

  if (!session) return <AuthPage />

  return <MainApp />
}
