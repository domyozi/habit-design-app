/**
 * Supabase クライアント初期化
 * TASK-0004: 認証フロー実装
 *
 * 【設計方針】: anon key のみ使用（service_role key はバックエンドのみ）
 * 🔵 信頼性レベル: TASK-0004.md・NFR-101 より
 */
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を .env に設定してください')
}

/** 【Supabaseクライアント】: 認証・DBアクセスに使用するシングルトンインスタンス 🔵 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
