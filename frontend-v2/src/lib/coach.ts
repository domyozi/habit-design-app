import type { TabId } from '@/types'

export interface CoachAction {
  title: string
  detail: string
  ctaLabel?: string
  tab?: TabId
}

export interface CoachSnapshot {
  heading: string
  status: string
  summary: string
  actions: CoachAction[]
  risks: string[]
  aiPrompt?: string
}

const truncateList = (items: string[]) => items.filter(Boolean).slice(0, 3)

export const buildHomeCoachSnapshot = (params: {
  completionRate: number
  todayDone: number
  todayTotal: number
  hasBoss: boolean
  bossCompleted: boolean
  eveningCheckedCount: number
}) => {
  const { completionRate, todayDone, todayTotal, hasBoss, bossCompleted, eveningCheckedCount } = params
  const actions: CoachAction[] = []
  const risks: string[] = []

  if (todayDone < todayTotal) {
    actions.push({
      title: 'Morning sequence を再開する',
      detail: `未完了の task が ${todayTotal - todayDone} 件あります。`,
      ctaLabel: 'Open morning',
      tab: 'morning',
    })
  }
  if (!hasBoss) {
    actions.push({
      title: '明日の primary target を定義する',
      detail: 'Evening review に次の最重要タスクを置くと、翌朝の迷いが減ります。',
      ctaLabel: 'Open evening',
      tab: 'evening',
    })
    risks.push('Primary target が未設定のまま日を終える可能性があります。')
  }
  if (completionRate >= 100) {
    actions.push({
      title: '今月の進捗を確認する',
      detail: '完了率が高い日に monthly analysis へ接続すると学習が残りやすいです。',
      ctaLabel: 'Open monthly',
      tab: 'monthly',
    })
  }
  if (eveningCheckedCount === 0) {
    risks.push('Evening review が未着手だと、翌日の計画精度が下がります。')
  }
  if (hasBoss && !bossCompleted) {
    risks.push('Primary target が未完了です。終盤の時間をそこへ集約してください。')
  }

  return {
    heading: 'Coach panel',
    status: `${todayDone}/${todayTotal} completed`,
    summary: completionRate >= 80
      ? '今日は実行面が安定しています。残りの判断を AI ではなく優先順位で絞るフェーズです。'
      : '今日はまだ再収束の余地があります。最も効く1手に絞って行動を立て直すのが有効です。',
    actions: actions.slice(0, 3),
    risks: truncateList(risks),
    aiPrompt: `Surface: Home dashboard
Completion rate: ${todayDone}/${todayTotal} (${completionRate}%)
Primary target exists: ${hasBoss ? 'yes' : 'no'}
Primary target completed: ${bossCompleted ? 'yes' : 'no'}
Evening review count: ${eveningCheckedCount}

Give a concise operator-style coaching brief for today.`,
  } satisfies CoachSnapshot
}

export const buildMonthlyCoachSnapshot = (params: {
  topWins: Array<{ label: string; actual: number; target: number }>
  underTarget: Array<{ label: string; actual: number; target: number }>
  activeGoalCount: number
}) => {
  const { topWins, underTarget, activeGoalCount } = params
  const lead = topWins[0]
  const gap = underTarget[0]

  const actions: CoachAction[] = []
  if (gap) {
    actions.push({
      title: `${gap.label} の立て直し方針を決める`,
      detail: `${gap.actual}/${gap.target} で遅れています。To Do 定義の見直しまで踏み込む価値があります。`,
      ctaLabel: 'Open settings',
      tab: 'settings',
    })
  }
  if (activeGoalCount === 0) {
    actions.push({
      title: '長期ゴールを定義する',
      detail: '月次分析に判断軸がないため、Wanna Be の基準面を先に作る必要があります。',
      ctaLabel: 'Open Wanna Be',
      tab: 'wanna-be',
    })
  }
  actions.push({
    title: '保存済みレポートを確認する',
    detail: '定量だけでなく日報の文脈も合わせて見ると改善案の質が上がります。',
  })

  return {
    heading: 'Coach panel',
    status: lead ? `${lead.label} leads` : 'No dominant signal',
    summary: gap
      ? `${gap.label} が今月のボトルネックです。進捗不足を個人の意思ではなく設計差分として扱う方が改善しやすいです。`
      : '今月の信号は概ね揃っています。上振れている習慣を再現できる条件を抽出する段階です。',
    actions: actions.slice(0, 3),
    risks: truncateList([
      gap ? `${gap.label} が月末着地を下げています。` : '',
      activeGoalCount === 0 ? 'Wanna Be が空だと分析の意味づけが弱くなります。' : '',
    ]),
    aiPrompt: `Surface: Monthly analysis
Top wins: ${topWins.map(item => `${item.label} ${item.actual}/${item.target}`).join(', ') || 'none'}
Under target: ${underTarget.map(item => `${item.label} ${item.actual}/${item.target}`).join(', ') || 'none'}
Active goal count: ${activeGoalCount}

Give a concise monthly coaching brief with execution-oriented next steps.`,
  } satisfies CoachSnapshot
}

export const buildSettingsCoachSnapshot = (params: {
  activeTodoCount: number
  inactiveTodoCount: number
  hasSavedSuggestion: boolean
}) => {
  const { activeTodoCount, inactiveTodoCount, hasSavedSuggestion } = params

  const actions: CoachAction[] = [
    {
      title: '有効な To Do を減らしすぎていないか確認する',
      detail: `現在の active items は ${activeTodoCount} 件です。削りすぎると習慣網羅性が落ちます。`,
    },
  ]
  if (hasSavedSuggestion) {
    actions.push({
      title: '保存済み AI suggestion を差分として確認する',
      detail: 'append / replace を使い分けると設計変更の衝撃を小さくできます。',
    })
  }
  if (inactiveTodoCount > 0) {
    actions.push({
      title: 'hidden items を棚卸しする',
      detail: `${inactiveTodoCount} 件の inactive To Do が残っています。過去履歴維持のため放置されやすい領域です。`,
    })
  }

  return {
    heading: 'Coach panel',
    status: `${activeTodoCount} active items`,
    summary: '設定画面は入力面ではなく、習慣設計の operating table として使うのがよい状態です。',
    actions: actions.slice(0, 3),
    risks: truncateList([
      activeTodoCount > 18 ? 'To Do が増えすぎると daily execution 面の密度が下がります。': '',
      !hasSavedSuggestion ? 'AI suggestion を保存していないため、設計変更の履歴が残りにくいです。': '',
    ]),
    aiPrompt: `Surface: Settings
Active todo count: ${activeTodoCount}
Inactive todo count: ${inactiveTodoCount}
Saved AI suggestion: ${hasSavedSuggestion ? 'yes' : 'no'}

Give a concise coaching brief for habit-system configuration.`,
  } satisfies CoachSnapshot
}

export const buildIdentityCoachSnapshot = (params: {
  criticalCount: number
  activeCount: number
}) => {
  const { criticalCount, activeCount } = params

  return {
    heading: 'Coach panel',
    status: `${criticalCount} critical goals`,
    summary: activeCount > 0
      ? 'Identity board は飾りではなく、今日の判断を狭めるフィルターとして機能させるべきです。'
      : '長期ゴールが空なので、実行面と意味づけが分離しています。',
    actions: [
      {
        title: criticalCount === 0 ? 'Critical goal を1件定義する' : 'Critical goal と daily habit の接続を見直す',
        detail: criticalCount === 0 ? '最重要目標がないと daily action の優先順位がぶれます。' : '重要目標が daily execution へ落ちているか確認してください。',
        ctaLabel: 'Open settings',
        tab: 'settings',
      },
    ],
    risks: truncateList([
      activeCount === 0 ? 'Identity board に active goal がありません。' : '',
      criticalCount === 0 ? '最重要目標が不在です。' : '',
    ]),
    aiPrompt: `Surface: Identity board
Active goals: ${activeCount}
Critical goals: ${criticalCount}

Give a concise coaching brief for aligning identity and execution.`,
  } satisfies CoachSnapshot
}
