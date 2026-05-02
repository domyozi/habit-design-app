// ============================================================
// 習慣テンプレート定義
//
// 設定画面の「テンプレート選択 → 数値調整」動線で使う初期セット。
// docs/design/habit-design-app の Plan に基づき、カテゴリ別に整理。
// ユーザーは template を選んで title / target_value 等を上書きできる。
// ============================================================

import type {
  CreateHabitRequest,
  HabitAggregation,
  HabitMetricType,
} from '@/types/habit'

export type HabitTemplateCategory =
  | 'wakeup'      // 体を起こす
  | 'exercise'    // 運動
  | 'mind'        // 心を整える
  | 'input'       // インプット
  | 'body'        // 食・体調管理
  | 'output'      // アウトプット

export interface HabitTemplateCategoryMeta {
  id: HabitTemplateCategory
  label: string
  description: string
  accent: string  // tailwind color hint
}

export const HABIT_TEMPLATE_CATEGORIES: HabitTemplateCategoryMeta[] = [
  { id: 'wakeup',   label: '体を起こす', description: '起床直後のリズム作り', accent: '#fcd34d' },
  { id: 'exercise', label: '運動',       description: '朝の散歩・筋トレ等',   accent: '#fb7185' },
  { id: 'mind',     label: '心を整える', description: '瞑想・ジャーナル等',   accent: '#a78bfa' },
  { id: 'input',    label: 'インプット', description: '読書・学習',           accent: '#60a5fa' },
  { id: 'body',     label: '食・体調',   description: '朝食・体重等',         accent: '#34d399' },
  { id: 'output',   label: 'アウトプット', description: 'ディープワーク・創作', accent: '#f59e0b' },
]

export interface HabitTemplate {
  id: string                    // ユニークなテンプレID（UI key用）
  category: HabitTemplateCategory
  title: string
  description?: string          // 効能などの補足文
  metric_type: HabitMetricType
  target_value?: number
  target_value_max?: number
  target_time?: string          // HH:MM:SS（time_before / time_after 用）
  unit?: string
  aggregation?: HabitAggregation
  scheduled_time?: string       // HH:MM（任意の実行時刻ヒント）
}

export const HABIT_TEMPLATES: HabitTemplate[] = [
  // 体を起こす
  {
    id: 'wakeup-time',
    category: 'wakeup',
    title: '起床時刻を一定にする',
    description: '平日休日問わず起床を固定。睡眠リズムの安定に効く。',
    metric_type: 'time_before',
    target_time: '07:00:00',
    unit: '時刻',
    aggregation: 'first',
  },
  {
    id: 'morning-sun',
    category: 'wakeup',
    title: '朝日を浴びる',
    description: '起床後 15〜30 分以内。セロトニン分泌で夜の眠気にも効く。',
    metric_type: 'binary',
  },
  {
    id: 'morning-water',
    category: 'wakeup',
    title: 'コップ1杯の水を飲む',
    description: '起床時の脱水状態をリセット。',
    metric_type: 'binary',
  },
  {
    id: 'stretch',
    category: 'wakeup',
    title: 'ストレッチ',
    description: '5〜10 分のモビリティワーク。',
    metric_type: 'duration',
    target_value: 5,
    unit: '分',
    aggregation: 'sum',
  },
  {
    id: 'bed-making',
    category: 'wakeup',
    title: 'ベッドメイキング',
    description: '小さな達成感を1日の最初に作る。',
    metric_type: 'binary',
  },

  // 運動
  {
    id: 'morning-walk',
    category: 'exercise',
    title: '朝の散歩',
    description: '朝日効果と運動効果を兼ねる。',
    metric_type: 'duration',
    target_value: 10,
    unit: '分',
    aggregation: 'sum',
  },
  {
    id: 'cardio-hiit',
    category: 'exercise',
    title: '軽い有酸素 / HIIT',
    metric_type: 'duration',
    target_value: 15,
    unit: '分',
    aggregation: 'sum',
  },
  {
    id: 'yoga',
    category: 'exercise',
    title: 'ヨガ・太陽礼拝',
    metric_type: 'duration',
    target_value: 10,
    unit: '分',
    aggregation: 'sum',
  },
  {
    id: 'strength',
    category: 'exercise',
    title: '筋トレ',
    description: '自重でも可。',
    metric_type: 'duration',
    target_value: 10,
    unit: '分',
    aggregation: 'sum',
  },

  // 心を整える
  {
    id: 'meditation',
    category: 'mind',
    title: '瞑想 / マインドフルネス',
    metric_type: 'duration',
    target_value: 5,
    unit: '分',
    aggregation: 'sum',
  },
  {
    id: 'journaling',
    category: 'mind',
    title: 'ジャーナリング',
    description: 'モーニングページなど。',
    metric_type: 'numeric_min',
    target_value: 1,
    unit: 'ページ',
    aggregation: 'sum',
  },
  {
    id: 'gratitude',
    category: 'mind',
    title: '感謝リスト',
    description: '3 つ書き出す。',
    metric_type: 'binary',
  },
  {
    id: 'top3-tasks',
    category: 'mind',
    title: 'タスク3つ書き出す',
    description: 'Ivy Lee Method。',
    metric_type: 'binary',
  },

  // インプット
  {
    id: 'reading',
    category: 'input',
    title: '読書',
    metric_type: 'duration',
    target_value: 15,
    unit: '分',
    aggregation: 'sum',
  },
  {
    id: 'language-study',
    category: 'input',
    title: '語学学習',
    metric_type: 'duration',
    target_value: 10,
    unit: '分',
    aggregation: 'sum',
  },
  {
    id: 'news-check',
    category: 'input',
    title: 'ニュースチェック',
    description: '時間を区切る。',
    metric_type: 'numeric_max',
    target_value: 15,
    unit: '分',
    aggregation: 'sum',
  },

  // 食・体調
  {
    id: 'protein-breakfast',
    category: 'body',
    title: 'タンパク質中心の朝食',
    metric_type: 'binary',
  },
  {
    id: 'weight-log',
    category: 'body',
    title: '体重記録',
    description: '記録自体が達成。',
    metric_type: 'binary',
    unit: 'kg',
  },

  // アウトプット
  {
    id: 'deep-work',
    category: 'output',
    title: 'ディープワーク',
    description: '起床後の高集中時間を最重要タスクに。',
    metric_type: 'duration',
    target_value: 25,
    unit: '分',
    aggregation: 'sum',
  },
  {
    id: 'creative',
    category: 'output',
    title: '創作活動',
    description: '文章・コード等。',
    metric_type: 'duration',
    target_value: 30,
    unit: '分',
    aggregation: 'sum',
  },
]

export const HABIT_TEMPLATES_BY_CATEGORY: Record<HabitTemplateCategory, HabitTemplate[]> =
  HABIT_TEMPLATE_CATEGORIES.reduce(
    (acc, cat) => {
      acc[cat.id] = HABIT_TEMPLATES.filter((t) => t.category === cat.id)
      return acc
    },
    {} as Record<HabitTemplateCategory, HabitTemplate[]>,
  )

/** テンプレートから CreateHabitRequest を組み立てる */
export const templateToCreateRequest = (
  tpl: HabitTemplate,
  overrides: Partial<CreateHabitRequest> = {},
): CreateHabitRequest => {
  const req: CreateHabitRequest = {
    title: tpl.title,
    metric_type: tpl.metric_type,
  }
  if (tpl.target_value !== undefined) req.target_value = tpl.target_value
  if (tpl.target_value_max !== undefined) req.target_value_max = tpl.target_value_max
  if (tpl.target_time !== undefined) req.target_time = tpl.target_time
  if (tpl.unit !== undefined) req.unit = tpl.unit
  if (tpl.aggregation !== undefined) req.aggregation = tpl.aggregation
  if (tpl.scheduled_time !== undefined) req.scheduled_time = tpl.scheduled_time
  return { ...req, ...overrides }
}
