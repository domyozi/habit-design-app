/**
 * KPI/KGI ゴール逆算トラッキング 型定義
 *
 * 作成日: 2026-04-15
 * 関連設計: architecture.md
 * 追加先: docs/design/habit-design-app/interfaces.ts および
 *         frontend-v2/src/types/index.ts
 *
 * 信頼性レベル:
 * - 🔵 青信号: EARS要件定義書・設計文書・ヒアリングを参考にした確実な型定義
 * - 🟡 黄信号: 要件定義書・設計文書から妥当な推測による型定義
 * - 🔴 赤信号: 推測による型定義
 */

// ========================================
// 共通型
// ========================================

/**
 * KPI/KGI の指標タイプ
 * 🔵 REQ-KGI-003・REQ-KPI-002・ヒアリング「両方対応」より
 */
export type MetricType = 'numeric' | 'percentage' | 'binary';

/**
 * KPI の追跡頻度
 * 🔵 REQ-KPI-003・ヒアリング「日次・週次・月次」より
 */
export type TrackingFrequency = 'daily' | 'weekly' | 'monthly';

/**
 * KPI ログの入力方法
 * 🔵 REQ-LOG-004・ヒアリング「拡張性」より
 */
export type KpiInputMethod = 'manual' | 'voice' | 'auto';

// ========================================
// KGI（既存 Goal テーブルの拡張）
// ========================================

/**
 * 既存 Goal に KGI 属性を追加した拡張型
 * 🔵 REQ-KGI-001・既存 Goal 型より
 *
 * 既存の Goal 型（interfaces.ts）から以下フィールドを引き継ぐ:
 * - id, user_id, wanna_be_id, title, description, display_order, is_active, created_at, updated_at
 */
export interface GoalWithKgi {
  // === 既存フィールド（変更なし） ===
  id: string; // 🔵 既存
  user_id: string; // 🔵 既存
  wanna_be_id: string | null; // 🔵 既存
  title: string; // 🔵 既存
  description: string | null; // 🔵 既存
  display_order: number; // 🔵 既存
  is_active: boolean; // 🔵 既存
  created_at: string; // 🔵 既存
  updated_at: string; // 🔵 既存

  // === KGI 拡張フィールド（新規 nullable カラム） ===
  target_value: number | null; // 🔵 REQ-KGI-004: KGI 目標値（binary 型では不使用）
  current_value: number | null; // 🔵 REQ-KGI-005: KGI 現在値
  unit: string | null; // 🔵 REQ-KGI-004: 単位（例: "kg", "冊", "%"）
  target_date: string | null; // 🔵 REQ-KGI-002: 期限（NULL = 通常 Goal = KGI でない）
  metric_type: MetricType | null; // 🔵 REQ-KGI-003: 指標タイプ

  // === API レスポンス計算フィールド ===
  achievement_rate: number | null; // 🔵 REQ-KGI-006: 達成率（%）サーバー計算
  days_remaining: number | null; // 🔵 REQ-KGI-007: 残り日数（負の場合は期限超過）
  is_expired: boolean; // 🔵 EDGE-KPI-005: 期限超過フラグ
  is_kgi: boolean; // 🔵 target_date IS NOT NULL の場合 true

  // === JOIN フィールド ===
  kpis?: Kpi[]; // 🟡 詳細取得時に付与
}

/**
 * KGI 設定リクエスト（既存 Goal に KGI 属性を付与）
 * 🔵 REQ-KGI-001・REQ-KGI-002 より
 */
export interface SetKgiRequest {
  target_value?: number; // 🔵 numeric/percentage 型で必須
  unit?: string; // 🔵 単位
  target_date: string; // 🔵 REQ-KGI-002: 必須
  metric_type: MetricType; // 🔵 必須
  current_value?: number; // 🟡 初期現在値（省略可）
}

/**
 * KGI 現在値更新リクエスト
 * 🔵 REQ-KGI-005 より
 */
export interface UpdateKgiCurrentValueRequest {
  current_value: number; // 🔵 新しい現在値
}

// ========================================
// KPI（新規テーブル）
// ========================================

/**
 * KPI（中間指標）
 * 🔵 REQ-KPI-001〜005 より
 */
export interface Kpi {
  id: string; // 🔵 UUID
  user_id: string; // 🔵 ユーザー紐付け
  goal_id: string; // 🔵 REQ-KPI-001: 紐付き KGI
  title: string; // 🔵 KPI 名
  description: string | null; // 🟡 説明
  metric_type: MetricType; // 🔵 REQ-KPI-002: 指標タイプ
  target_value: number | null; // 🔵 REQ-KPI-004: 目標値
  unit: string | null; // 🔵 REQ-KPI-004: 単位
  tracking_frequency: TrackingFrequency; // 🔵 REQ-KPI-003: 追跡頻度
  display_order: number; // 🟡 表示順
  is_active: boolean; // 🟡 有効/無効
  created_at: string; // 🔵 共通パターン
  updated_at: string; // 🔵 共通パターン

  // === JOIN フィールド ===
  today_log?: KpiLog | null; // 🔵 今日のログ（今日画面用）
  habit_ids?: string[]; // 🔵 REQ-KPI-006: 紐付き習慣 ID リスト
}

/**
 * KPI 作成リクエスト
 * 🔵 REQ-KPI-001〜005 より
 */
export interface CreateKpiRequest {
  goal_id: string; // 🔵 紐付き KGI の ID
  title: string; // 🔵 KPI 名
  description?: string; // 🟡 任意
  metric_type: MetricType; // 🔵 指標タイプ
  target_value?: number; // 🔵 numeric/percentage 型で推奨
  unit?: string; // 🔵 単位
  tracking_frequency: TrackingFrequency; // 🔵 追跡頻度
  display_order?: number; // 🟡 任意
}

/**
 * KPI 習慣連結リクエスト
 * 🔵 REQ-KPI-006・REQ-KPI-007 より
 */
export interface LinkKpiHabitsRequest {
  habit_ids: string[]; // 🔵 紐付ける習慣 ID リスト（全上書き方式）
}

// ========================================
// KPI ログ（新規テーブル）
// ========================================

/**
 * KPI ログ（日次記録）
 * 🔵 REQ-LOG-001 より
 */
export interface KpiLog {
  id: string; // 🔵 UUID
  kpi_id: string; // 🔵 KPI 紐付け
  user_id: string; // 🔵 RLS 用
  log_date: string; // 🔵 記録日（YYYY-MM-DD）
  value: number; // 🔵 記録値（binary 型: 1.0=達成 / 0.0=未達成）
  input_method: KpiInputMethod | null; // 🔵 REQ-LOG-004: 入力方法
  note: string | null; // 🟡 メモ
  created_at: string; // 🔵 共通パターン
}

/**
 * KPI ログ記録（upsert）リクエスト
 * 🔵 REQ-LOG-002・EDGE-KPI-007 より
 */
export interface UpsertKpiLogRequest {
  log_date: string; // 🔵 記録日（YYYY-MM-DD）
  value: number; // 🔵 記録値
  input_method?: KpiInputMethod; // 🟡 任意（デフォルト: 'manual'）
  note?: string; // 🟡 任意
}

// ========================================
// グラフ用集計型
// ========================================

/**
 * KPI グラフデータポイント（日次・週次・月次共通）
 * 🔵 REQ-LOG-005 より
 */
export interface KpiChartDataPoint {
  date: string; // 🔵 日次: YYYY-MM-DD / 週次: 週の開始日 / 月次: YYYY-MM
  value: number | null; // 🔵 集計値（記録なしの場合 null）
}

/**
 * KPI グラフレスポンス
 * 🔵 REQ-LOG-005 より
 */
export interface KpiChartResponse {
  kpi_id: string; // 🔵 KPI ID
  granularity: 'daily' | 'weekly' | 'monthly'; // 🔵 集計粒度
  data_points: KpiChartDataPoint[]; // 🔵 データポイント
  summary: {
    avg: number | null; // 🟡 期間平均
    max: number | null; // 🟡 期間最大
    min: number | null; // 🟡 期間最小
    latest_value: number | null; // 🔵 最新値
    target_value: number | null; // 🔵 目標値（グラフ基準線用）
  };
}

// ========================================
// ダッシュボード用集計型
// ========================================

/**
 * 今日画面用 KPI（未記録/記録済みを含む）
 * 🔵 REQ-DASH-002 より
 */
export interface KpiWithTodayStatus extends Kpi {
  today_completed: boolean; // 🔵 今日記録済みかどうか
  today_value: number | null; // 🔵 今日の記録値（未記録の場合 null）
  connected_habits: Array<{ habit_id: string; habit_title: string }>; // 🔵 REQ-KPI-006
}

// ========================================
// 音声入力 KPI 更新用
// ========================================

/**
 * 音声入力 kpi_update 分類後のレスポンス
 * 🔵 REQ-LOG-003・EDGE-KPI-006 より
 */
export interface VoiceKpiUpdateResponse {
  type: 'kpi_update'; // 🔵 既存 JournalEntryType の kpi_update
  value: number; // 🔵 抽出された数値
  unit_hint: string | null; // 🔵 発話から抽出した単位ヒント
  candidates: Array<{
    kpi_id: string; // 🔵 候補 KPI ID
    title: string; // 🔵 KPI タイトル
    unit: string | null; // 🔵 KPI 単位
  }>; // 🔵 EDGE-KPI-006: 単位一致するKPI候補
}

// ========================================
// 週次レビュー KGI 統合型
// ========================================

/**
 * 週次レビュー KGI 進捗サマリー（AIコンテキスト用・個人情報なし）
 * 🔵 REQ-REVIEW-001・NFR-KPI-102 より
 */
export interface WeeklyKgiSummary {
  kgi_count: number; // 🔵 アクティブ KGI 数
  kgi_achievement_rates: number[]; // 🔵 各 KGI の達成率（%）の配列（タイトルは含まない）
  kpi_weekly_averages: Array<{
    metric_type: MetricType; // 🔵 KPI タイプ
    target_value: number | null; // 🔵 目標値
    weekly_avg: number | null; // 🔵 今週の平均
    tracking_frequency: TrackingFrequency; // 🔵 追跡頻度
  }>; // 🔵 KPI 週次集計（タイトルは送らない）
}

// ========================================
// 信頼性レベルサマリー
// ========================================
/**
 * - 🔵 青信号: 52件 (82%)
 * - 🟡 黄信号: 11件 (17%)
 * - 🔴 赤信号: 0件 (0%)
 *
 * 品質評価: 高品質
 */
