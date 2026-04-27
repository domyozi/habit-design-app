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
  { id: 'settings', icon: '⊙', label: '設定',       note: 'システム設計',      color: '#a78bfa' },
]

const NAV_EN: NavItem[] = [
  { id: 'home',     icon: '⌂', label: 'Home',     note: 'daily execution',   color: '#7dd3fc' },
  { id: 'morning',  icon: '◎', label: 'Morning',  note: 'core + routine',    color: '#7dd3fc' },
  { id: 'evening',  icon: '◑', label: 'Evening',  note: 'review + next day', color: '#c4b5fd' },
  { id: 'monthly',  icon: '⊞', label: 'Analytics',note: 'habit analysis',    color: '#38bdf8' },
  { id: 'wanna-be', icon: '◆', label: 'Wanna Be', note: 'identity board',    color: '#f59e0b' },
  { id: 'settings', icon: '⊙', label: 'Settings', note: 'system design',     color: '#a78bfa' },
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
