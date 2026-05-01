/**
 * アプリエントリーポイント
 * TASK-0012: フロントエンド共通基盤
 *
 * 【設計方針】:
 * - QueryClientProvider でアプリ全体をラップ
 * - staleTime は 5分（300秒）に設定してAPI呼び出しを削減
 *
 * 🔵 信頼性レベル: architecture.md より
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'

/**
 * 【QueryClientインスタンス】: staleTime 5分でサーバー状態を管理
 * 🔵 NFR-201: UX向上のためのキャッシュ設定
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5分
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
