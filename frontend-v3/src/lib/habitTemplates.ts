// Habit measurement templates (10 types).
// Maps UI templates → existing backend Habit.metric_type + unit.
// Source: dailyos/project/screen-habits.jsx + app-shared.jsx APP.habits.

import type { HabitProof, HabitSource, HabitType } from './mockData'

export type BackendMetricType =
  | 'binary'
  | 'numeric_min'
  | 'numeric_max'
  | 'duration'
  | 'range'
  | 'time_before'
  | 'time_after'

export interface HabitTemplate {
  id: HabitType
  glyph: string
  label: string
  description: string
  metricType: BackendMetricType
  unit?: string
  defaultGoal?: number | string
  goalKind: 'gte' | 'lte' | 'before' | 'done'
  defaultProof: HabitProof
  defaultSource: HabitSource
  exampleHabits: string[]
}

export const TEMPLATES: HabitTemplate[] = [
  {
    id: 'boolean',
    glyph: '◯',
    label: 'Boolean',
    description: 'やる / やらないの 2 択',
    metricType: 'binary',
    goalKind: 'done',
    defaultProof: 'none',
    defaultSource: 'manual',
    exampleHabits: ['瞑想', '白湯を飲む', '日記'],
  },
  {
    id: 'count',
    glyph: '#',
    label: 'Count',
    description: '回数で計測',
    metricType: 'numeric_min',
    unit: '回',
    defaultGoal: 90,
    goalKind: 'gte',
    defaultProof: 'photo',
    defaultSource: 'manual',
    exampleHabits: ['筋トレ', '腹筋', 'スクワット'],
  },
  {
    id: 'duration',
    glyph: '⏱',
    label: 'Duration',
    description: '時間で計測（分）',
    metricType: 'duration',
    unit: '分',
    defaultGoal: 25,
    goalKind: 'gte',
    defaultProof: 'none',
    defaultSource: 'manual',
    exampleHabits: ['英語学習', '読書', '楽器練習'],
  },
  {
    id: 'pages',
    glyph: '📖',
    label: 'Pages',
    description: 'ページ数で計測',
    metricType: 'numeric_min',
    unit: 'p',
    defaultGoal: 15,
    goalKind: 'gte',
    defaultProof: 'photo',
    defaultSource: 'manual',
    exampleHabits: ['読書', '論文'],
  },
  {
    id: 'time-target',
    glyph: '🌅',
    label: 'Time target',
    description: '目標時刻 vs 実績',
    metricType: 'time_before',
    unit: '時刻',
    defaultGoal: '05:30',
    goalKind: 'before',
    defaultProof: 'auto',
    defaultSource: 'apple-watch',
    exampleHabits: ['早起き', '就寝'],
  },
  {
    id: 'score',
    glyph: '△',
    label: 'Score',
    description: 'テストスコア等',
    metricType: 'numeric_min',
    unit: '点',
    defaultGoal: 820,
    goalKind: 'gte',
    defaultProof: 'photo',
    defaultSource: 'manual',
    exampleHabits: ['TOEIC', '英検', '模試'],
  },
  {
    id: 'distance',
    glyph: '→',
    label: 'Distance',
    description: '距離で計測（km）',
    metricType: 'numeric_min',
    unit: 'km',
    defaultGoal: 5,
    goalKind: 'gte',
    defaultProof: 'auto',
    defaultSource: 'nike-run',
    exampleHabits: ['ランニング', 'ウォーキング', 'サイクリング'],
  },
  {
    id: 'weight',
    glyph: '◐',
    label: 'Weight',
    description: '体重・体脂肪',
    metricType: 'numeric_max',
    unit: 'kg',
    defaultGoal: 68,
    goalKind: 'lte',
    defaultProof: 'auto',
    defaultSource: 'health-app',
    exampleHabits: ['体重', '体脂肪'],
  },
  {
    id: 'currency',
    glyph: '¥',
    label: 'Currency',
    description: '金額で計測',
    metricType: 'numeric_min',
    unit: '円',
    defaultGoal: 1000,
    goalKind: 'gte',
    defaultProof: 'none',
    defaultSource: 'manual',
    exampleHabits: ['貯金', '投資', '節約'],
  },
  {
    id: 'words',
    glyph: '◧',
    label: 'Words',
    description: '語彙数等',
    metricType: 'numeric_min',
    unit: '語',
    defaultGoal: 50,
    goalKind: 'gte',
    defaultProof: 'none',
    defaultSource: 'manual',
    exampleHabits: ['英単語', '漢字'],
  },
]

export interface SourceMeta {
  id: HabitSource
  label: string
  glyph: string
  description: string
  auto: boolean
}

export const SOURCE_META: Record<HabitSource, SourceMeta> = {
  'apple-watch': { id: 'apple-watch', label: 'Apple Watch', glyph: '⌚', description: '起床・睡眠・心拍', auto: true },
  'nike-run':    { id: 'nike-run',    label: 'Nike Run',    glyph: '🏃', description: 'ラン距離・ペース', auto: true },
  'health-app':  { id: 'health-app',  label: 'Health',      glyph: '♥',  description: '体重・歩数',       auto: true },
  'strava':      { id: 'strava',      label: 'Strava',      glyph: '◈',  description: 'サイクリング',     auto: true },
  'photo':       { id: 'photo',       label: 'Photo Proof', glyph: '📷', description: '写真で証明',       auto: false },
  'calendar':    { id: 'calendar',    label: 'Calendar',    glyph: '📅', description: '時間ブロック',     auto: true },
  'manual':      { id: 'manual',      label: 'Manual',      glyph: '✓',  description: 'チェック',         auto: false },
}

export const TEMPLATE_BY_ID = TEMPLATES.reduce<Record<HabitType, HabitTemplate>>(
  (acc, t) => ({ ...acc, [t.id]: t }),
  {} as Record<HabitType, HabitTemplate>,
)
