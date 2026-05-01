/**
 * 認証済み画面共通レイアウト
 * 全認証済みページ（Dashboard / WannaBe / WeeklyReview / Settings）に適用
 *
 * - ダーク背景（bg-[#020617]）
 * - フローティング底部ナビゲーション（BottomNav）を常時表示
 * - min-h-screen で全画面をカバー
 */
import type { ReactNode } from 'react'
import { BottomNav } from '@/components/layout/BottomNav'

interface AuthenticatedLayoutProps {
  children: ReactNode
}

export const AuthenticatedLayout = ({ children }: AuthenticatedLayoutProps) => (
  <div className="relative flex min-h-screen flex-col bg-[#020617]">
    <div className="flex-1 pb-6">
      {children}
    </div>
    <BottomNav />
  </div>
)
