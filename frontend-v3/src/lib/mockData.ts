// Mock data sourced from dailyos/project/app-shared.jsx (APP).
// Sprint 1 uses this as a stand-in until backend wiring (Sprint 1b / Sprint 2).

export type HabitType =
  | 'boolean' | 'time-target' | 'count' | 'duration' | 'distance'
  | 'pages' | 'score' | 'weight' | 'currency' | 'words'

export type HabitSource =
  | 'manual' | 'apple-watch' | 'nike-run' | 'strava' | 'health-app' | 'photo' | 'calendar'

export type HabitProof = 'none' | 'photo' | 'auto'

export interface Habit {
  id: string
  label: string
  cat: 'core' | 'micro'
  type: HabitType
  unit?: string
  goal: { kind: string; value?: number | string; baseline?: number; deadline?: string; splits?: string; period?: string }
  today: { value: number | string | boolean; done: boolean; viaPhoto?: boolean; viaAuto?: boolean }
  month: number
  target: number
  best: number
  streak: number
  lagging?: boolean
  source: HabitSource
  proof: HabitProof
  xpBase: number
  xpBoost: number
  series: (number | null)[]
  breakdown?: { l: string; v: number; c: string }[]
  pace?: string
  heart?: number
  kcal?: number
}

export interface Task {
  id: string
  label: string
  est: number
  done: boolean
}

export interface FlowMessage {
  role: 'me' | 'ai'
  t: string
  text: string
  actions?: { kind: string; label: string }[]
}

export interface DiaryEntry {
  date: string
  summary: string
  mood: string
}

export interface NoteRef {
  id: string
  title: string
  updated: string
  pinned?: boolean
}

export interface AppData {
  user: { name: string; age: number; streak: number }
  date: { y: number; m: number; d: number; weekday: string }
  primaryTarget: { value: string; anchor: string; minutes: number; progress: number }
  habits: Habit[]
  suggested: { id: string; label: string; why: string; confidence: number; source: string }[]
  presets: { id: string; label: string; cat: string; popularity: number }[]
  tasks: Task[]
  flowMessages: FlowMessage[]
  diary: DiaryEntry[]
  notes: NoteRef[]
  memory: {
    identity: string
    goal: string
    patterns: string[]
    keywords: string[]
  }
}

export const APP: AppData = {
  user: { name: 'めーメー', age: 34, streak: 47 },
  date: { y: 2026, m: 5, d: 2, weekday: '土' },
  primaryTarget: {
    value: 'Vinci 提案書を最終化する',
    anchor: 'Anthropic への転職',
    minutes: 120,
    progress: 0,
  },
  habits: [
    { id: 'h1', label: '早起き', cat: 'core', type: 'time-target', unit: '時刻',
      goal: { kind: 'before', value: '05:30' }, today: { value: '05:18', done: true, viaPhoto: false, viaAuto: true },
      month: 14, target: 20, best: 18, streak: 4,
      source: 'apple-watch', proof: 'auto', xpBase: 25, xpBoost: 0,
      series: [5.4, 5.5, 5.3, null, 5.6, 5.4, 5.3, 5.5, 5.4, null, 5.5, 5.4, 5.3, 5.4, null, 5.5, 5.4, 5.3, 5.4, 5.4, null, 5.5, 5.4, 5.3, 5.4, null, 5.4, 5.5, 5.3] },
    { id: 'h2', label: '筋トレ', cat: 'core', type: 'count', unit: '回',
      goal: { kind: 'gte', value: 90, splits: '30回×3セット' }, today: { value: 90, done: true, viaPhoto: true, viaAuto: false },
      month: 16, target: 24, best: 20, streak: 2,
      source: 'photo', proof: 'photo', xpBase: 30, xpBoost: 15,
      series: [60,90,90,0,90,90,90,0,90,60,0,90,90,90,0,90,90,90,0,60,90,90,0,90,90,90,0,60,90] },
    { id: 'h3', label: '英語学習', cat: 'core', type: 'duration', unit: '分',
      goal: { kind: 'gte', value: 25 }, today: { value: 0, done: false },
      month: 6, target: 20, best: 14, streak: 0, lagging: true,
      source: 'manual', proof: 'none', xpBase: 30, xpBoost: 0,
      breakdown: [{ l: '語彙', v: 15, c: '#c45c2a' }, { l: '長文', v: 7, c: '#0b0c0b' }, { l: 'リス', v: 3, c: '#7a3d6e' }],
      series: [25,0,30,25,0,0,40,25,0,25,0,0,25,30,0,0,25,0,0,0,25,30,0,0,0,0,25,0,0] },
    { id: 'h4', label: '読書', cat: 'core', type: 'pages', unit: 'p',
      goal: { kind: 'gte', value: 15 }, today: { value: 8, done: false },
      month: 8, target: 20, best: 12, streak: 0,
      source: 'manual', proof: 'photo', xpBase: 20, xpBoost: 10,
      series: [12,15,18,0,15,15,20,0,15,12,0,15,18,15,0,15,0,15,15,0,12,15,0,15,18,0,15,8] },
    { id: 'h5', label: '有酸素運動', cat: 'core', type: 'distance', unit: 'km',
      goal: { kind: 'gte', value: 5 }, today: { value: 6.4, done: true, viaPhoto: false, viaAuto: true },
      month: 11, target: 15, best: 13, streak: 3,
      source: 'nike-run', proof: 'auto', xpBase: 35, xpBoost: 0,
      pace: '5:42/km', heart: 142, kcal: 412,
      series: [5.2,6.1,0,5.4,7.0,0,5.1,5.8,6.4,0,5.2,5.5,0,6.0,5.4,0,5.6,7.2,0,5.4,5.1,0,6.4,5.8,0,5.5,6.0,0,6.4] },
    { id: 'h6', label: 'TOEIC スコア', cat: 'core', type: 'score', unit: '点',
      goal: { kind: 'gte', value: 820, baseline: 745, deadline: '9/30' }, today: { value: 745, done: false },
      month: 1, target: 2, best: 2, streak: 0,
      source: 'manual', proof: 'photo', xpBase: 50, xpBoost: 30,
      series: [680, 705, 720, 745] },
    { id: 'h7', label: '体重', cat: 'core', type: 'weight', unit: 'kg',
      goal: { kind: 'lte', value: 68, baseline: 73 }, today: { value: 70.4, done: true, viaAuto: true },
      month: 22, target: 28, best: 26, streak: 14,
      source: 'health-app', proof: 'auto', xpBase: 10, xpBoost: 0,
      series: [73.0,72.8,72.6,72.5,72.3,72.1,71.9,71.8,71.6,71.4,71.3,71.2,71.0,70.9,70.8,70.7,70.7,70.6,70.5,70.5,70.5,70.4,70.4,70.4] },
    { id: 'h8', label: '貯金', cat: 'core', type: 'currency', unit: '円',
      goal: { kind: 'gte', value: 1000000, period: 'year' }, today: { value: 18500, done: true, viaAuto: true },
      month: 142000, target: 167000, best: 195000, streak: 0,
      source: 'manual', proof: 'auto', xpBase: 15, xpBoost: 5,
      series: [12000,8000,15000,22000,18000,9000,14000,20000,11000,17000,16000,13000,18500] },
    { id: 'h9', label: '瞑想', cat: 'micro', type: 'boolean',
      goal: { kind: 'done' }, today: { value: true, done: true, viaPhoto: false },
      month: 18, target: 24, best: 22, streak: 6,
      source: 'manual', proof: 'none', xpBase: 20, xpBoost: 0,
      series: [1,1,0,1,1,1,1,0,1,1,1,0,1,1,1,1,0,1,1,1,0,1,1,1,1,1,0,1,1] },
    { id: 'h10', label: '白湯を飲む', cat: 'micro', type: 'boolean',
      goal: { kind: 'done' }, today: { value: true, done: true },
      month: 26, target: 30, best: 28, streak: 8,
      source: 'manual', proof: 'none', xpBase: 5, xpBoost: 0,
      series: [1,1,1,0,1,1,1,1,1,0,1,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,0,1] },
  ],
  suggested: [
    { id: 's1', label: '寝る90分前の入浴', why: 'ジャーナルで「夜の睡眠の質」を週3回書いている', confidence: 0.86, source: 'journal' },
    { id: 's2', label: '英語を朝の固定枠に', why: '英語タスクが3日連続未着手。朝の方が達成率68%高い', confidence: 0.92, source: 'pattern' },
    { id: 's3', label: '15分の散歩（昼）', why: '午後のエネルギーが落ちる傾向。同年代の最頻習慣', confidence: 0.74, source: 'community' },
  ],
  presets: [
    { id: 'p1', label: '読書 30分', cat: '学習', popularity: 12400 },
    { id: 'p2', label: '瞑想 10分', cat: 'マインド', popularity: 9800 },
    { id: 'p3', label: '日記', cat: '振り返り', popularity: 15600 },
    { id: 'p4', label: 'ストレッチ', cat: '身体', popularity: 8200 },
    { id: 'p5', label: '禁酒', cat: '生活', popularity: 4100 },
    { id: 'p6', label: '水 2L', cat: '身体', popularity: 11800 },
  ],
  tasks: [
    { id: 't1', label: '英語学習カレンダー埋め', est: 15, done: false },
    { id: 't2', label: '父親ミッション（印刷・返送）の時間設定', est: 20, done: false },
    { id: 't3', label: '開発過程を発信する', est: 30, done: false },
    { id: 't4', label: 'GW 7日間スモールローンチマイルストーン（手書き）', est: 60, done: false },
    { id: 't5', label: 'Habit アプリ開発ノート記録', est: 25, done: false },
  ],
  flowMessages: [
    { role: 'ai', t: '07:42', text: 'おはようございます。昨日のジャーナルでテレビボード取り付けが残タスクとして書かれていましたが、今朝の優先度を整えますか？' },
    { role: 'me', t: '07:43', text: 'まずは Vinci の提案書を進めたい。GW の計画も今日中に整理したい。' },
    { role: 'ai', t: '07:43', text: '了解しました。提案書を 09:00–11:00 に固定し、GW計画は手書きで 11:30–12:00 に置く案を組みました。\n英語学習が3日未着手なので、提案書の前 08:00–08:25 に短く差し込みますか？' },
    { role: 'me', t: '07:44', text: '英語は朝の固定にしたい。今日の25分は飲み込むので入れて。' },
    { role: 'ai', t: '07:44', text: '反映しました。「英語を朝の固定枠に」を Habit suggestion として保存しますか？（採用されると Habit 候補に並びます）',
      actions: [{ kind: 'adopt', label: 'Habit に採用する' }, { kind: 'later', label: 'あとで' }] },
  ],
  diary: [
    { date: '5/2(土)', summary: 'テレビボード取り付けというラストピースが見えている状態。GWの計画は手書きで整理を推奨。', mood: 'focused' },
    { date: '5/1(金)', summary: '英語学習が結構楽しかった様子。継続のためのトリガを探す段階。', mood: 'warm' },
    { date: '4/30(木)', summary: '新居対応がほぼ完了。次の優先順位として英語と副業推進が並ぶ。', mood: 'steady' },
    { date: '4/29(水)', summary: '副業推進ブロックが取れず焦り。睡眠の後ろ倒しが原因として記述。', mood: 'tense' },
    { date: '4/28(火)', summary: 'GWの計画をたてる前に、現在地のリストアップ。手書きが効いた。', mood: 'reflective' },
  ],
  notes: [
    { id: 'n1', title: 'Habit Design MVPまでに必要なこと', updated: 'たったいま', pinned: true },
    { id: 'n2', title: 'アイデア', updated: '1時間前', pinned: true },
    { id: 'n3', title: '2026/04/28', updated: '1時間前' },
    { id: 'n4', title: '2026/05/01', updated: '1時間前' },
    { id: 'n5', title: '英会話', updated: '21時間前' },
    { id: 'n6', title: '2026/04/29', updated: '21時間前' },
  ],
  memory: {
    identity: 'AI と一緒に働き方をデザインするプロダクトデザイナー。',
    goal: 'Anthropic に SA / PM として転職する。',
    patterns: [
      '早朝4時台起床でピックルボール後に業務に移行する習慣。',
      '朝の時間を思考・学びに活用している。時間が限られると複数タスクの同時着手傾向。',
      'ノート記述で思考を整理・外在化させている。',
      '夜間の残り時間では複数タスクの同時着手傾向が見られ、完璧性志向により睡眠を後回しにする傾向。',
      '声のメモから始める複合的アプローチ（通院継続、ボディメイク、運動）を並行実施。',
    ],
    keywords: ['削ぎ落とす美学', '意思決定の質', '集中力', '深堀り', '実行力', '質の良い睡眠'],
  },
}
