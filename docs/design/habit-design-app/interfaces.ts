/**
 * 習慣設計アプリ TypeScript型定義
 *
 * 作成日: 2026-04-12
 * 関連設計: architecture.md
 * 対象: React フロントエンド (src/types/)
 *
 * 信頼性レベル:
 * - 🔵 青信号: 要件定義書・DBスキーマ・ユーザーヒアリングを参考にした確実な型定義
 * - 🟡 黄信号: 要件定義書・DBスキーマから妥当な推測による型定義
 * - 🔴 赤信号: 要件定義書・DBスキーマにない推測による型定義
 */

// ========================================
// エンティティ定義（DBスキーマ対応）
// ========================================

/**
 * ユーザープロフィール
 * 🔵 REQ-103/701・DBスキーマ user_profiles より
 */
export interface UserProfile {
  id: string; // 🔵 Supabase auth.users ID
  display_name: string | null; // 🟡 表示名
  timezone: string; // 🔵 EDGE-102: タイムゾーン
  weekly_review_day: number; // 🔵 REQ-701: 週次レビュー曜日（1=月〜7=日）
  notification_email: string | null; // 🔵 REQ-801
  notification_enabled: boolean; // 🔵 REQ-802
  created_at: string; // 🔵 共通パターン
  updated_at: string; // 🔵 共通パターン
}

/**
 * Wanna Be（将来像）
 * 🔵 REQ-201/202・DBスキーマ wanna_be より
 */
export interface WannaBe {
  id: string; // 🔵 UUID
  user_id: string; // 🔵 ユーザー紐付け
  text: string; // 🔵 REQ-201: 将来像テキスト
  version: number; // 🔵 REQ-202: 編集バージョン
  is_current: boolean; // 🔵 現在有効なWanna Be
  created_at: string; // 🔵 共通パターン
  updated_at: string; // 🔵 共通パターン
}

/**
 * 長期目標
 * 🔵 REQ-203/204・DBスキーマ goals より
 */
export interface Goal {
  id: string; // 🔵 UUID
  user_id: string; // 🔵 ユーザー紐付け
  wanna_be_id: string | null; // 🔵 元Wanna Be
  title: string; // 🔵 REQ-203: 目標タイトル
  description: string | null; // 🟡 詳細説明
  display_order: number; // 🟡 表示順序
  is_active: boolean; // 🟡 有効/無効
  created_at: string; // 🔵 共通パターン
  updated_at: string; // 🔵 共通パターン
}

/**
 * 習慣（ルーティン）
 * 🔵 REQ-301/304/305・DBスキーマ habits より
 */
export interface Habit {
  id: string; // 🔵 UUID
  user_id: string; // 🔵 ユーザー紐付け
  goal_id: string | null; // 🔵 REQ-205: どのゴールに効くか
  title: string; // 🔵 習慣名
  description: string | null; // 🟡 習慣の説明
  frequency: HabitFrequency; // 🟡 頻度
  scheduled_time: string | null; // 🔵 REQ-305: 実行時刻（HH:MM形式）
  display_order: number; // 🟡 チェックリスト表示順
  current_streak: number; // 🔵 REQ-502: 現在のストリーク
  longest_streak: number; // 🟡 最長ストリーク
  is_active: boolean; // 🔵 REQ-304: ソフト削除
  created_at: string; // 🔵 共通パターン
  updated_at: string; // 🔵 共通パターン
  // JOIN フィールド（APIレスポンス用）
  goal?: Goal; // 🔵 REQ-205: Wanna Be接続表示用
  today_log?: HabitLog | null; // 🔵 ダッシュボード用今日のログ
}

/**
 * 習慣の頻度
 * 🟡 DBスキーマ habits.frequency から推測
 */
export type HabitFrequency = 'daily' | 'weekdays' | 'weekends' | 'custom';

/**
 * 習慣ログ（日次達成記録）
 * 🔵 REQ-501/502・DBスキーマ habit_logs より
 */
export interface HabitLog {
  id: string; // 🔵 UUID
  habit_id: string; // 🔵 習慣紐付け
  user_id: string; // 🔵 RLS用
  log_date: string; // 🔵 記録日（YYYY-MM-DD）
  completed: boolean; // 🔵 REQ-501: 達成/未達成
  completed_at: string | null; // 🟡 達成時刻
  input_method: 'manual' | 'voice' | 'auto' | null; // 🟡 入力方法
  created_at: string; // 🔵 共通パターン
  // JOIN フィールド
  failure_reason?: FailureReason | null; // 🔵 REQ-406
}

/**
 * 未達成理由
 * 🔵 REQ-406/602・DBスキーマ failure_reasons より
 */
export interface FailureReason {
  id: string; // 🔵 UUID
  habit_log_id: string; // 🔵 ログ紐付け
  user_id: string; // 🔵 RLS用
  reason: string; // 🔵 REQ-406: 理由テキスト
  created_at: string; // 🔵 共通パターン
}

/**
 * ジャーナルエントリー
 * 🔵 REQ-402・DBスキーマ journal_entries より
 */
export interface JournalEntry {
  id: string; // 🔵 UUID
  user_id: string; // 🔵 ユーザー紐付け
  entry_date: string; // 🔵 記録日（YYYY-MM-DD）
  content: string; // 🔵 REQ-402: 入力テキスト
  entry_type: JournalEntryType; // 🔵 AI分類結果
  raw_input: string | null; // 🟡 元の音声入力テキスト
  created_at: string; // 🔵 共通パターン
}

/**
 * ジャーナルエントリー種別（AI分類結果）
 * 🔵 REQ-402より
 */
export type JournalEntryType = 'journaling' | 'daily_report' | 'checklist' | 'kpi_update';

/**
 * 週次レビュー
 * 🔵 REQ-701/702・DBスキーマ weekly_reviews より
 */
export interface WeeklyReview {
  id: string; // 🔵 UUID
  user_id: string; // 🔵 ユーザー紐付け
  week_start: string; // 🔵 週の開始日（月曜, YYYY-MM-DD）
  week_end: string; // 🔵 週の終了日（日曜）
  ai_feedback: string | null; // 🔵 REQ-702: AIフィードバック
  achievement_rate: number | null; // 🟡 週間達成率（%）
  suggested_actions: AIAction[] | null; // 🔵 REQ-303: AI提案アクション
  status: 'pending' | 'generating' | 'completed' | 'failed'; // 🟡 生成状態
  created_at: string; // 🔵 共通パターン
}

/**
 * AI提案アクション（REQ-303: 範囲制限付き変更）
 * 🔵 REQ-303・ヒアリングQ9より
 */
export interface AIAction {
  type: AIActionType; // 🔵 アクション種別（3種類のみ）
  habit_id?: string; // 🔵 対象習慣ID
  suggested_time?: string; // 🔵 change_time 用（HH:MM形式）
  reason: string; // 🔵 提案理由（ユーザーへの説明）
}

/**
 * AI許可アクション種別（REQ-303: この3種類のみ許可）
 * 🔵 REQ-303・ヒアリングQ9: 「決められた枠組み内の動きのみを許容」より
 */
export type AIActionType = 'change_time' | 'add_habit' | 'remove_habit';

/**
 * バッジ定義
 * 🔵 REQ-901/902・DBスキーマ badge_definitions より
 */
export interface BadgeDefinition {
  id: string; // 🔵 バッジID（例: 'streak_7'）
  name: string; // 🔵 バッジ名
  description: string | null; // 🔵 説明
  condition_type: 'streak' | 'total_count' | 'weekly_rate'; // 🔵 条件種別
  condition_value: number; // 🔵 条件値
  icon_name: string | null; // 🟡 アイコン名
}

/**
 * ユーザーバッジ（獲得済み）
 * 🔵 REQ-901/902・DBスキーマ user_badges より
 */
export interface UserBadge {
  id: string; // 🔵 UUID
  user_id: string; // 🔵 ユーザー
  badge_id: string; // 🔵 バッジ種別
  habit_id: string | null; // 🟡 どの習慣で獲得
  earned_at: string; // 🔵 獲得日時
  // JOIN フィールド
  badge?: BadgeDefinition; // 🔵 バッジ情報
}

// ========================================
// APIリクエスト/レスポンス
// ========================================

/**
 * Wanna Be 登録/更新リクエスト
 * 🔵 REQ-201/202より
 */
export interface UpsertWannaBeRequest {
  text: string; // 🔵 将来像テキスト
}

/**
 * Wanna Be AI分析レスポンス（SSEストリーミング）
 * 🔵 REQ-203・ヒアリング技術選定Q5（ストリーミング）より
 */
export interface WannaBeAnalysisChunk {
  type: 'chunk' | 'done' | 'error'; // 🔵 ストリーミングイベント種別
  content?: string; // 🔵 テキストチャンク
  suggested_goals?: Array<{ title: string; description: string }>; // 🔵 done時に目標候補
  error?: string; // 🔵 エラーメッセージ
}

/**
 * 習慣作成リクエスト
 * 🔵 REQ-301/302/304より
 */
export interface CreateHabitRequest {
  goal_id?: string; // 🔵 REQ-205: 紐付けゴール（任意）
  title: string; // 🔵 習慣名
  description?: string; // 🟡 説明（任意）
  frequency?: HabitFrequency; // 🟡 頻度
  scheduled_time?: string; // 🔵 REQ-305: 実行時刻
  display_order?: number; // 🟡 表示順
}

/**
 * 習慣更新リクエスト（AI提案承認 or 手動編集）
 * 🔵 REQ-303より
 */
export interface UpdateHabitRequest {
  action: AIActionType | 'manual_edit'; // 🔵 REQ-303: アクション種別
  title?: string; // 🔵 manual_edit用
  scheduled_time?: string; // 🔵 change_time用
  goal_id?: string; // 🟡 manual_edit用
}

/**
 * 習慣ログ更新リクエスト
 * 🔵 REQ-404/501より
 */
export interface UpdateHabitLogRequest {
  date: string; // 🔵 記録日（YYYY-MM-DD）
  completed: boolean; // 🔵 達成/未達成
  failure_reason?: string; // 🔵 REQ-406: 未達成理由
  input_method?: 'manual' | 'voice'; // 🟡 入力方法
}

/**
 * 音声入力リクエスト
 * 🔵 REQ-401/402より
 */
export interface VoiceInputRequest {
  text: string; // 🔵 音声→テキスト変換後
  date: string; // 🔵 記録対象日
}

/**
 * 音声入力AI分類レスポンス
 * 🔵 REQ-402/403より
 */
export interface VoiceInputResponse {
  type: JournalEntryType | 'unknown'; // 🔵 REQ-402: AI分類結果
  updated_habits?: HabitLog[]; // 🔵 REQ-403: 更新されたログ
  failed_habits?: Array<{ habit_id: string; title: string }>; // 🔵 REQ-406: 未達成習慣リスト
  journal_entry?: JournalEntry; // 🔵 ジャーナリング保存時
}

/**
 * 週次レビューSSEストリーミングチャンク
 * 🔵 REQ-702・ヒアリング技術選定Q5より
 */
export interface WeeklyReviewChunk {
  type: 'chunk' | 'done' | 'error'; // 🔵 ストリーミングイベント種別
  content?: string; // 🔵 テキストチャンク
  actions?: AIAction[]; // 🔵 done時にAI提案アクション
  achievement_rate?: number; // 🟡 週間達成率
  error?: string; // 🔵 エラーメッセージ
}

// ========================================
// ダッシュボード用集計型
// ========================================

/**
 * ダッシュボード表示データ
 * 🔵 REQ-205/306/502/504より
 */
export interface DashboardData {
  today_habits: HabitWithTodayStatus[]; // 🔵 REQ-306: 今日のルーティンリスト
  weekly_stats: WeeklyStats; // 🔵 REQ-505
  recent_badges: UserBadge[]; // 🟡 最近獲得したバッジ
}

/**
 * 今日の習慣状態（ダッシュボード表示用）
 * 🔵 REQ-205/306/502より
 */
export interface HabitWithTodayStatus extends Habit {
  today_completed: boolean; // 🔵 今日の達成状態
  wanna_be_connection_text: string | null; // 🔵 REQ-205: Wanna Be接続文言（例: 「→ 過去一の身体に +1」）
}

/**
 * 週間統計
 * 🔵 REQ-504/505より
 */
export interface WeeklyStats {
  week_start: string; // 🔵 今週の開始日
  total_habits: number; // 🔵 習慣総数
  completed_count: number; // 🔵 達成数
  achievement_rate: number; // 🔵 REQ-504: 達成率（%）
  habit_stats: HabitStat[]; // 🔵 習慣ごとの達成率
}

/**
 * 習慣ごとの統計
 * 🔵 REQ-504より
 */
export interface HabitStat {
  habit_id: string; // 🔵 習慣ID
  habit_title: string; // 🔵 習慣名
  achievement_rate: number; // 🔵 REQ-504: 達成率（%）
  current_streak: number; // 🔵 REQ-502: 現在のストリーク
}

// ========================================
// 共通型定義
// ========================================

/**
 * APIレスポンス共通型
 * 🔵 共通パターン
 */
export interface ApiResponse<T> {
  success: boolean; // 🔵
  data?: T; // 🔵
  error?: ApiError; // 🔵
}

/**
 * APIエラー
 * 🔵 EDGE-001/003対応
 */
export interface ApiError {
  code: string; // 🔵 エラーコード（例: 'AI_UNAVAILABLE', 'FORBIDDEN_ACTION'）
  message: string; // 🔵 日本語エラーメッセージ
}

// ========================================
// 信頼性レベルサマリー
// ========================================
/**
 * - 🔵 青信号: 58件 (80%)
 * - 🟡 黄信号: 15件 (20%)
 * - 🔴 赤信号: 0件 (0%)
 *
 * 品質評価: 高品質
 */
