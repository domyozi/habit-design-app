import type { TabId } from '@/types'

export type AppLang = 'ja' | 'en'

export interface NavItem {
  id: TabId
  icon: string
  label: string
  note: string
  color: string
}

const NAV_JA: NavItem[] = [
  { id: 'home',     icon: '⌂', label: 'ホーム',    note: 'デイリー実行',      color: '#7dd3fc' },
  { id: 'morning',  icon: '◎', label: 'モーニング', note: 'コア + ルーティン', color: '#7dd3fc' },
  { id: 'evening',  icon: '◑', label: 'イブニング', note: '振り返り + 翌日',   color: '#c4b5fd' },
  { id: 'monthly',  icon: '⊞', label: '分析',       note: '習慣分析・レポート',color: '#38bdf8' },
  { id: 'wanna-be', icon: '◆', label: '理想像',     note: 'アイデンティティ',  color: '#f59e0b' },
  { id: 'notes',    icon: '✎', label: 'ノート',    note: 'らくがき帳',         color: '#86efac' },
  { id: 'calendar', icon: '⊟', label: 'カレンダー', note: 'Google Calendar',   color: '#fb923c' },
  { id: 'health',   icon: '⊕', label: 'ヘルス',     note: 'Apple Health',      color: '#34d399' },
]

const NAV_EN: NavItem[] = [
  { id: 'home',     icon: '⌂', label: 'Home',     note: 'daily execution',   color: '#7dd3fc' },
  { id: 'morning',  icon: '◎', label: 'Morning',  note: 'core + routine',    color: '#7dd3fc' },
  { id: 'evening',  icon: '◑', label: 'Evening',  note: 'review + next day', color: '#c4b5fd' },
  { id: 'monthly',  icon: '⊞', label: 'Analytics',note: 'habit analysis',    color: '#38bdf8' },
  { id: 'wanna-be', icon: '◆', label: 'Wanna Be', note: 'identity board',    color: '#f59e0b' },
  { id: 'notes',    icon: '✎', label: 'Notes',    note: 'scratch pad',       color: '#86efac' },
  { id: 'calendar', icon: '⊟', label: 'Calendar', note: 'Google Calendar',   color: '#fb923c' },
  { id: 'health',   icon: '⊕', label: 'Health',   note: 'Apple Health',      color: '#34d399' },
]

export const getNavItems = (lang: AppLang): NavItem[] =>
  lang === 'ja' ? NAV_JA : NAV_EN

export interface BottomItem {
  id: TabId | 'cal'
  label: string
  short: string
}

const BOTTOM_JA: BottomItem[] = [
  { id: 'home',    label: 'ホーム', short: 'HM' },
  { id: 'morning', label: '朝',     short: 'AM' },
  { id: 'evening', label: '夜',     short: 'PM' },
  { id: 'cal',     label: '日付',   short: 'DT' },
  { id: 'more',    label: 'その他', short: 'MX' },
]

const BOTTOM_EN: BottomItem[] = [
  { id: 'home',    label: 'Home',    short: 'HM' },
  { id: 'morning', label: 'Morning', short: 'AM' },
  { id: 'evening', label: 'Evening', short: 'PM' },
  { id: 'cal',     label: 'Date',    short: 'DT' },
  { id: 'more',    label: 'More',    short: 'MX' },
]

export const getBottomItems = (lang: AppLang): BottomItem[] =>
  lang === 'ja' ? BOTTOM_JA : BOTTOM_EN
