"""
全エンドポイント共通 Pydantic スキーマ定義
TASK-0005: FastAPI共通基盤実装
TASK-0029: KGI/KPI モデル追加

【設計方針】:
- interfaces.ts の型定義を Python 側に対応させる
- APIResponse[T] ジェネリック型で型安全なレスポンスを実現
- AIActionType は Literal で3種類に制限（REQ-303）

🔵 信頼性レベル: api-endpoints.md・interfaces.ts より
"""
import math
from datetime import date, datetime
from typing import Any, Generic, Literal, Optional, TypeVar

from pydantic import BaseModel, Field, field_validator, model_validator

# ジェネリック型変数
T = TypeVar("T")

# =============================================
# 共通型
# =============================================


class APIResponse(BaseModel, Generic[T]):
    """
    【共通レスポンス型】: 全エンドポイントで使用するジェネリックレスポンス
    🔵 信頼性レベル: api-endpoints.md エラーレスポンス共通フォーマット / interfaces.ts ApiResponse より
    """

    success: bool
    data: Optional[T] = None
    message: str = ""


class ErrorDetail(BaseModel):
    """エラー詳細（エラーレスポンス内の error フィールド）🔵"""

    code: str
    message: str


class ErrorResponse(BaseModel):
    """
    【エラーレスポンス型】: 全エラー応答で使用
    🔵 信頼性レベル: api-endpoints.md エラーレスポンス共通フォーマット より
    """

    success: bool = False
    error: ErrorDetail


# REQ-303: AIアクション種別は3種類のみ許可
AIActionType = Literal["change_time", "add_habit", "remove_habit"]


class AIAction(BaseModel):
    """
    【AI提案アクション】: REQ-303 で3種類に制限
    🔵 信頼性レベル: REQ-303・interfaces.ts AIAction より
    """

    action_type: AIActionType
    habit_id: Optional[str] = None
    params: dict = Field(default_factory=dict)
    reason: str = ""


# 習慣の頻度
HabitFrequency = Literal["daily", "weekdays", "weekends", "custom"]

# 習慣の指標タイプ
#   binary       : completed=true で達成（従来挙動）
#   numeric_min  : numeric_value >= target_value で達成（読書時間 ≥ 15分 等）
#   numeric_max  : numeric_value <= target_value で達成（コーヒー杯数 ≤ 2 等）
#   duration     : numeric_min と同等。unit='分' を意味付けするためのエイリアス
#   range        : target_value <= numeric_value <= target_value_max
#   time_before  : time_value <= target_time（起床時刻 ≤ 07:00 等）
#   time_after   : time_value >= target_time（コーヒー時刻 ≥ 09:00 等）
HabitMetricType = Literal[
    "binary", "numeric_min", "numeric_max", "duration", "range", "time_before", "time_after"
]

# 同日複数ログを集約する関数（HealthKit 自動取得など、将来の用途）
HabitAggregation = Literal["exists", "sum", "max", "first", "avg"]

# 習慣ログの入力経路。'shortcut' は iOS Shortcuts / HealthKit 自動取得用。
HabitInputMethod = Literal["manual", "voice", "auto", "shortcut"]

# =============================================
# ドメインモデル（レスポンス用）
# =============================================


class UserProfile(BaseModel):
    """
    【ユーザープロフィール】
    🔵 信頼性レベル: DBスキーマ user_profiles / interfaces.ts UserProfile より
    """

    id: str
    display_name: Optional[str] = None
    timezone: str = "Asia/Tokyo"
    weekly_review_day: int = Field(default=1, ge=1, le=7)
    notification_email: Optional[str] = None
    notification_enabled: bool = False
    age: Optional[int] = Field(default=None, ge=0, le=150)
    # P0: Advanced モード toggle。ON で Goal 階層編集 / habit_goals 多対多 / Legacy KPI 画面が解放される
    advanced_mode: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class WannaBe(BaseModel):
    """
    【Wanna Be（将来像）】
    🔵 信頼性レベル: DBスキーマ wanna_be / interfaces.ts WannaBe より
    """

    id: str
    user_id: str
    text: str
    version: int = 1
    is_current: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class Goal(BaseModel):
    """
    【長期目標】
    🔵 信頼性レベル: DBスキーマ goals / interfaces.ts Goal より
    """

    id: str
    user_id: str
    wanna_be_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    display_order: int = 0
    is_active: bool = True
    # P1: 階層対応。NULL なら top-level、UUID なら子 Goal（milestone 等）
    parent_goal_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class Habit(BaseModel):
    """
    【習慣定義】
    🔵 信頼性レベル: DBスキーマ habits / interfaces.ts Habit より
    """

    id: str
    user_id: str
    goal_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    frequency: HabitFrequency = "daily"
    scheduled_time: Optional[str] = None  # HH:MM形式
    display_order: int = 0
    current_streak: int = 0
    longest_streak: int = 0
    is_active: bool = True
    wanna_be_connection_text: Optional[str] = None
    metric_type: HabitMetricType = "binary"
    target_value: Optional[float] = None
    target_value_max: Optional[float] = None
    target_time: Optional[str] = None  # HH:MM:SS or HH:MM
    unit: Optional[str] = None
    aggregation: HabitAggregation = "exists"
    # AI-native: 証明方法 / 記録ソース / 基本 XP
    # 🔵 信頼性レベル: migrations/add_habit_proof_xp.sql より
    proof_type: Literal["none", "photo", "auto"] = "none"
    source_kind: str = "manual"
    xp_base: int = 10
    # Sprint v4-prep P3b: habit_goals junction から populate される、
    # この habit が貢献する Goal の ID リスト。Advanced モード時のみ意味を持つ。
    # 旧 goal_id (= primary) も含めて全て入る。
    goal_ids: list[str] = []
    # Sprint v5: KPI 完全吸収用の 4 列。migration add_habit_aggregation_and_display_window.sql。
    # aggregation_kind: 'count' (達成回数) | 'sum' (累積値)
    # aggregation_period: 'daily' | 'weekly' | 'monthly'
    # period_target: count なら回数、sum なら unit ベースの累積値 (NULL=未設定)
    # display_window: Today への表示時間帯 (morning=04-12, noon=12-18, evening=18-04, anytime=常時)
    aggregation_kind: Literal["count", "sum"] = "count"
    aggregation_period: Literal["daily", "weekly", "monthly"] = "daily"
    period_target: Optional[float] = None
    display_window: Literal["morning", "noon", "evening", "anytime"] = "anytime"
    # Sprint habit-target-mode: 判定モード。
    #   daily       = 毎日達成型 (streak / 達成日数を見る)
    #   trajectory  = 推移型 (LineChart で軌跡を見る、達成判定はしない)
    #   None        = auto-infer (metric_type+unit から推論)
    target_mode: Optional[Literal["daily", "trajectory"]] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class HabitLog(BaseModel):
    """
    【習慣ログ（日次達成記録）】
    🔵 信頼性レベル: DBスキーマ habit_logs / interfaces.ts HabitLog より
    """

    id: str
    habit_id: str
    user_id: str
    log_date: str  # YYYY-MM-DD
    completed: bool
    completed_at: Optional[datetime] = None
    input_method: Optional[HabitInputMethod] = None
    numeric_value: Optional[float] = None
    time_value: Optional[str] = None  # HH:MM:SS
    # AI-native: 写真証明 URL / 付与 XP
    # 🔵 信頼性レベル: migrations/add_habit_proof_xp.sql より
    proof_url: Optional[str] = None
    xp_earned: int = 0
    created_at: Optional[datetime] = None


class FailureReason(BaseModel):
    """
    【未達成理由】
    🔵 信頼性レベル: DBスキーマ failure_reasons / interfaces.ts FailureReason より
    """

    id: str
    habit_log_id: str
    user_id: str
    reason: str
    created_at: Optional[datetime] = None


class JournalEntry(BaseModel):
    """
    【ジャーナルエントリー（3行日報・音声入力等）】
    🔵 信頼性レベル: DBスキーマ journal_entries / interfaces.ts JournalEntry より
    """

    id: str
    user_id: str
    entry_date: str  # YYYY-MM-DD
    content: str
    entry_type: Literal["journaling", "daily_report", "checklist", "kpi_update"]
    raw_input: Optional[str] = None
    created_at: Optional[datetime] = None


class WeeklyReview(BaseModel):
    """
    【週次レビュー】
    🔵 信頼性レベル: DBスキーマ weekly_reviews / interfaces.ts WeeklyReview より
    """

    id: str
    user_id: str
    week_start: str  # YYYY-MM-DD (月曜)
    week_end: str  # YYYY-MM-DD (日曜)
    ai_feedback: Optional[str] = None
    achievement_rate: Optional[float] = None
    suggested_actions: Optional[list[AIAction]] = None
    status: Literal["pending", "generating", "completed", "failed"] = "pending"
    created_at: Optional[datetime] = None


class BadgeDefinition(BaseModel):
    """
    【バッジ定義マスター】
    🔵 信頼性レベル: DBスキーマ badge_definitions / interfaces.ts BadgeDefinition より
    """

    id: str
    name: str
    description: Optional[str] = None
    condition_type: Literal["streak", "total_count", "weekly_rate"]
    condition_value: int
    icon_name: Optional[str] = None


class UserBadge(BaseModel):
    """
    【ユーザー取得バッジ】
    🔵 信頼性レベル: DBスキーマ user_badges / interfaces.ts UserBadge より
    """

    id: str
    user_id: str
    badge_id: str
    habit_id: Optional[str] = None
    earned_at: datetime
    badge: Optional[BadgeDefinition] = None


# =============================================
# リクエストモデル
# =============================================


class UpsertWannaBeRequest(BaseModel):
    """
    【Wanna Be 登録/更新リクエスト】
    🔵 信頼性レベル: interfaces.ts UpsertWannaBeRequest より
    """

    text: str = Field(..., min_length=1, max_length=1000)


class MandalaChart(BaseModel):
    """
    【マンダラチャート】
    🔵 信頼性レベル: DBスキーマ mandala_charts / Sprint Spec F-01 より
    """

    id: str
    user_id: str
    wanna_be_id: Optional[str] = None
    cells: Any  # JSONB: 9x9グリッドのJSONオブジェクト
    created_at: Optional[datetime] = None


class SaveMandalaRequest(BaseModel):
    """
    【マンダラ保存リクエスト】: POST /api/mandala で使用
    🔵 信頼性レベル: Sprint Spec F-02 より
    """

    wanna_be_id: Optional[str] = None
    cells: Any = Field(..., description="9x9グリッドのJSONBデータ")


class NotificationSettings(BaseModel):
    """
    【通知設定】: user_profiles テーブルの通知関連フィールドのみを返す専用モデル
    🔵 信頼性レベル: REQ-801/802・api-endpoints.md GET /notifications/settings より
    """

    notification_enabled: bool = True
    notification_email: Optional[str] = None
    weekly_review_day: int = Field(default=5, ge=1, le=7)


class UpdateNotificationSettingsRequest(BaseModel):
    """
    【通知設定更新リクエスト】
    🔵 信頼性レベル: REQ-801/802・api-endpoints.md PATCH /notifications/settings より
    """

    notification_enabled: Optional[bool] = None
    notification_email: Optional[str] = None
    weekly_review_day: Optional[int] = Field(None, ge=1, le=7)


class GoalItem(BaseModel):
    """
    【目標アイテム】: POST /goals リクエスト内の各目標
    🔵 信頼性レベル: REQ-203・api-endpoints.md より
    """

    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None


class SaveGoalsRequest(BaseModel):
    """
    【目標保存リクエスト】: AI提案の目標を一括承認・保存（最大3件）
    🔵 信頼性レベル: REQ-203/204・api-endpoints.md POST /goals より
    """

    wanna_be_id: Optional[str] = None
    # 【注意】: max_length は設定しない。件数チェックはルーター側で 400 VALIDATION_ERROR として返す
    # Pydantic の max_length=3 にすると 422 になり、仕様の 400 と異なるため
    goals: list[GoalItem] = Field(..., min_length=1)


class UpdateUserProfileRequest(BaseModel):
    """
    【ユーザープロフィール更新リクエスト】
    🟡 信頼性レベル: interfaces.ts から推測
    """

    display_name: Optional[str] = Field(None, max_length=100)
    timezone: Optional[str] = None
    weekly_review_day: Optional[int] = Field(None, ge=1, le=7)
    notification_email: Optional[str] = None
    notification_enabled: Optional[bool] = None
    age: Optional[int] = Field(None, ge=0, le=150)
    # P0: Advanced モード toggle
    advanced_mode: Optional[bool] = None


class CreateGoalRequest(BaseModel):
    """
    【目標作成リクエスト】
    🔵 信頼性レベル: interfaces.ts より
    """

    wanna_be_id: Optional[str] = None
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    display_order: Optional[int] = None
    # P1: 階層対応。Advanced モード時のみ frontend から送られる
    parent_goal_id: Optional[str] = None


class UpdateGoalRequest(BaseModel):
    """
    【目標更新リクエスト】Sprint G1: 個別 Goal の編集（title/description/display_order/is_active）
    KGI 属性は別エンドポイント（PATCH /goals/{id}/kgi）で扱う。
    """

    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None
    # P1: 階層対応。Advanced モード時のみ送られる。NULL を明示的に送ると親解除
    parent_goal_id: Optional[str] = None


class CreateHabitRequest(BaseModel):
    """
    【習慣作成リクエスト】
    🔵 信頼性レベル: interfaces.ts CreateHabitRequest より
    """

    goal_id: Optional[str] = None
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    frequency: HabitFrequency = "daily"
    scheduled_time: Optional[str] = None
    display_order: Optional[int] = None
    wanna_be_connection_text: Optional[str] = None
    # 量・時刻系
    metric_type: HabitMetricType = "binary"
    target_value: Optional[float] = None
    target_value_max: Optional[float] = None
    target_time: Optional[str] = None
    unit: Optional[str] = None
    aggregation: Optional[HabitAggregation] = None  # 未指定なら metric_type から推論
    # AI-native（任意）: 計測タイプ + 外部連携 + 写真証明 + XP
    proof_type: Optional[Literal["none", "photo", "auto"]] = None
    source_kind: Optional[str] = None
    xp_base: Optional[int] = None
    # Sprint v5: KPI 統合 4 列 (作成時は省略可、DB が default を入れる)
    aggregation_kind: Optional[Literal["count", "sum"]] = None
    aggregation_period: Optional[Literal["daily", "weekly", "monthly"]] = None
    period_target: Optional[float] = None
    display_window: Optional[Literal["morning", "noon", "evening", "anytime"]] = None
    # Sprint habit-target-mode: daily / trajectory / None(auto)
    target_mode: Optional[Literal["daily", "trajectory"]] = None


class UpdateHabitRequest(BaseModel):
    """
    【習慣更新リクエスト（AI提案承認 or 手動編集）】
    🔵 信頼性レベル: REQ-303 / interfaces.ts UpdateHabitRequest より
    """

    # 【設計方針】: str 型にして許可外アクションをルーターで 400 FORBIDDEN_ACTION として返す
    # Literal にすると Pydantic が 422 を返してしまい、仕様の 400 FORBIDDEN_ACTION と不整合になる
    action: str
    title: Optional[str] = None
    description: Optional[str] = None
    frequency: Optional[HabitFrequency] = None
    scheduled_time: Optional[str] = None
    goal_id: Optional[str] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None
    # 量・時刻系（manual_edit でのみ更新される想定）
    metric_type: Optional[HabitMetricType] = None
    target_value: Optional[float] = None
    target_value_max: Optional[float] = None
    target_time: Optional[str] = None
    unit: Optional[str] = None
    aggregation: Optional[HabitAggregation] = None
    # AI-native（任意・manual_edit でのみ更新される想定）
    proof_type: Optional[Literal["none", "photo", "auto"]] = None
    source_kind: Optional[str] = None
    xp_base: Optional[int] = None
    # Sprint v5: KPI 統合 4 列 (manual_edit のみで更新する想定)
    aggregation_kind: Optional[Literal["count", "sum"]] = None
    aggregation_period: Optional[Literal["daily", "weekly", "monthly"]] = None
    period_target: Optional[float] = None
    display_window: Optional[Literal["morning", "noon", "evening", "anytime"]] = None
    # Sprint habit-target-mode: daily / trajectory / None(auto)
    target_mode: Optional[Literal["daily", "trajectory"]] = None


class ReorderHabitsRequest(BaseModel):
    """
    【習慣並び替えリクエスト】
    渡された順序で display_order を 0..n-1 に振り直す。
    Sprint A-dnd: ドラッグ＆ドロップで並び替えた結果を 1 リクエストで送る。
    """

    ordered_ids: list[str] = Field(..., min_length=0)


class UpdateHabitLogRequest(BaseModel):
    """
    【習慣ログ更新リクエスト】
    🔵 信頼性レベル: interfaces.ts UpdateHabitLogRequest より
    """

    date: str  # YYYY-MM-DD
    completed: bool
    failure_reason: Optional[str] = None
    input_method: Optional[Literal["manual", "voice", "shortcut"]] = None
    # 量・時刻系（metric_type に応じて値を渡す）
    numeric_value: Optional[float] = None
    time_value: Optional[str] = None  # HH:MM or HH:MM:SS
    # AI-native（任意）: 写真証明 URL（Supabase Storage の habit-proofs バケット内 path）
    proof_url: Optional[str] = None


class VoiceInputRequest(BaseModel):
    """
    【音声入力リクエスト】
    🔵 信頼性レベル: interfaces.ts VoiceInputRequest より
    """

    text: str = Field(..., min_length=1)
    date: str  # YYYY-MM-DD


class CreateFailureReasonRequest(BaseModel):
    """
    【未達成理由記録リクエスト】
    🔵 信頼性レベル: REQ-406・api-endpoints.md より
    """

    reason: str = Field(..., min_length=1)
    log_date: str  # YYYY-MM-DD


# =============================================
# ダッシュボード用集計型
# =============================================


class HabitStat(BaseModel):
    """【習慣ごとの週間統計】🔵"""

    habit_id: str
    habit_title: str
    achievement_rate: float
    current_streak: int


class WeeklyStats(BaseModel):
    """【週間統計】🔵"""

    week_start: str
    total_habits: int
    completed_count: int
    achievement_rate: float
    habit_stats: list[HabitStat]


class HabitWithTodayStatus(Habit):
    """
    【今日の習慣状態（ダッシュボード表示用）】
    🔵 信頼性レベル: interfaces.ts HabitWithTodayStatus より
    """

    today_completed: bool = False


class DashboardData(BaseModel):
    """
    【ダッシュボード表示データ】
    🔵 信頼性レベル: interfaces.ts DashboardData より
    """

    today_habits: list[HabitWithTodayStatus]
    weekly_stats: WeeklyStats
    recent_badges: list[UserBadge]


# =============================================
# 音声入力レスポンス
# =============================================


class VoiceInputResponse(BaseModel):
    """
    【音声入力AI分類レスポンス】
    🔵 信頼性レベル: interfaces.ts VoiceInputResponse より
    """

    type: Literal["journaling", "daily_report", "checklist", "kpi_update", "unknown"]
    updated_habits: Optional[list[HabitLog]] = None
    failed_habits: Optional[list[dict[str, Any]]] = None
    journal_entry: Optional[JournalEntry] = None


# =============================================
# KGI/KPI モデル（TASK-0029）
# =============================================

# 共通 Literal 型
# 🔵 interfaces.ts MetricType / TrackingFrequency / KpiInputMethod より
MetricType = Literal["numeric", "percentage", "binary"]
TrackingFrequency = Literal["daily", "weekly", "monthly"]
KpiInputMethod = Literal["manual", "voice", "auto"]


class SetKgiRequest(BaseModel):
    """
    【KGI 設定リクエスト】: 既存 Goal を KGI として設定
    🔵 REQ-KGI-001〜003 / interfaces.ts SetKgiRequest より
    """

    target_value: Optional[float] = None  # numeric/percentage 型で推奨
    unit: Optional[str] = Field(None, max_length=20)
    target_date: date  # 必須: REQ-KGI-002
    metric_type: MetricType  # 必須: REQ-KGI-003
    current_value: Optional[float] = None

    @model_validator(mode="after")
    def validate_percentage_range(self) -> "SetKgiRequest":
        """percentage 型の target_value は 0〜100 の範囲: EDGE-KPI-004"""
        if self.metric_type == "percentage" and self.target_value is not None:
            if not (0 <= self.target_value <= 100):
                raise ValueError("percentage 型の target_value は 0〜100 の範囲で入力してください")
        return self


class UpdateKgiCurrentValueRequest(BaseModel):
    """
    【KGI 現在値更新リクエスト】
    🔵 REQ-KGI-005 / interfaces.ts UpdateKgiCurrentValueRequest より
    """

    current_value: float


class GoalWithKgiResponse(BaseModel):
    """
    【KGI 属性を含む Goal レスポンス】
    🔵 interfaces.ts GoalWithKgi より
    """

    id: str
    user_id: str
    wanna_be_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    display_order: int = 0
    is_active: bool = True
    # KGI 拡張フィールド（nullable: 通常 Goal との後方互換）
    target_value: Optional[float] = None
    current_value: Optional[float] = None
    unit: Optional[str] = None
    target_date: Optional[date] = None
    metric_type: Optional[MetricType] = None
    # サーバー計算フィールド
    achievement_rate: Optional[float] = None  # REQ-KGI-006
    days_remaining: Optional[int] = None  # REQ-KGI-007
    is_expired: bool = False  # EDGE-KPI-005
    is_kgi: bool = False  # target_date IS NOT NULL の場合 true
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class KpiCreate(BaseModel):
    """
    【KPI 作成リクエスト】
    🔵 REQ-KPI-001〜005 / interfaces.ts CreateKpiRequest より
    """

    goal_id: str  # REQ-KPI-001: 紐付き KGI の ID
    title: str = Field(..., max_length=200)
    description: Optional[str] = None
    metric_type: MetricType  # REQ-KPI-002
    target_value: Optional[float] = None  # REQ-KPI-004
    unit: Optional[str] = Field(None, max_length=20)  # REQ-KPI-004
    tracking_frequency: TrackingFrequency  # REQ-KPI-003
    display_order: int = 0


class SuggestKpisRequest(BaseModel):
    """
    【AI KPI 提案リクエスト】Sprint G3: 指定 Goal に対する KPI 候補を AI が提案する。
    """

    goal_id: str


class AiKpiSuggestion(BaseModel):
    """
    【AI KPI 提案 1 件】Sprint G3。LLM が JSON で吐いたものをパースしてこの形に詰める。
    """

    title: str = Field(..., max_length=200)
    metric_type: MetricType
    tracking_frequency: TrackingFrequency
    target_value: Optional[float] = None
    unit: Optional[str] = None
    reason: str = Field(..., max_length=400)
    link_habit_ids: list[str] = []


class SuggestHabitsRequest(BaseModel):
    """
    【AI 習慣提案リクエスト】指定 Goal の達成に貢献する習慣候補を AI に提案させる。
    user_prompt: ユーザーが「こういう習慣が欲しい」と任意で渡す自由テキスト。
                 length 上限を強めにかけて prompt injection / 過長を防ぐ。
                 None / 空文字 のときは従来通り Goal 情報だけで提案する。
    """

    goal_id: str
    user_prompt: Optional[str] = Field(default=None, max_length=400)


class AiHabitSuggestion(BaseModel):
    """
    【AI 習慣提案 1 件】Goal 達成に貢献する習慣を LLM が JSON で返したものをこの形に詰める。
    DB 書き込みなし。フロントは採用時に POST /api/habits を叩いて作成する。
    """

    title: str = Field(..., max_length=200)
    frequency: HabitFrequency = "daily"
    metric_type: HabitMetricType = "binary"
    target_value: Optional[float] = None
    unit: Optional[str] = Field(None, max_length=20)
    scheduled_time: Optional[str] = Field(None, max_length=8)  # "HH:MM" or "HH:MM:SS"
    # Sprint habit-target-mode: daily=毎日達成型 / trajectory=推移型。AI が判定して返す。
    target_mode: Optional[Literal["daily", "trajectory"]] = None
    # Sprint suggest-aggregation: 「週X回・月Y回・1日Z回」のような頻度ベースの習慣を
    # binary + period_target で表現するために AI に返させる。フロント側はこの 3 つを
    # createHabit に転送して、編集モーダルで「期間目標」が空欄にならないようにする。
    aggregation_kind: Optional[Literal["count", "sum"]] = None
    aggregation_period: Optional[Literal["daily", "weekly", "monthly"]] = None
    period_target: Optional[float] = None
    reason: str = Field(..., max_length=400)


class KpiUpdate(BaseModel):
    """
    【KPI 更新リクエスト】Sprint G1: 個別 KPI の編集。
    全フィールド optional。送られたフィールドだけ更新する。
    """

    title: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    metric_type: Optional[MetricType] = None
    target_value: Optional[float] = None
    unit: Optional[str] = Field(None, max_length=20)
    tracking_frequency: Optional[TrackingFrequency] = None
    display_order: Optional[int] = None


class KpiResponse(BaseModel):
    """
    【KPI レスポンス】
    🔵 interfaces.ts Kpi より
    """

    id: str
    user_id: str
    goal_id: str
    title: str
    description: Optional[str] = None
    metric_type: MetricType
    target_value: Optional[float] = None
    unit: Optional[str] = None
    tracking_frequency: TrackingFrequency
    display_order: int = 0
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    habit_ids: list[str] = []  # REQ-KPI-006: JOIN フィールド


class KpiWithTodayStatus(KpiResponse):
    """
    【今日の KPI 状態（MorningTab 用）】
    🔵 REQ-DASH-002 / interfaces.ts KpiWithTodayStatus より
    """

    today_completed: bool = False
    today_value: Optional[float] = None
    connected_habits: list[dict] = []  # {habit_id, habit_title}


class LinkKpiHabitsRequest(BaseModel):
    """
    【KPI 習慣連結リクエスト（全上書き方式）】
    🔵 REQ-KPI-006・REQ-KPI-007 / interfaces.ts LinkKpiHabitsRequest より
    """

    habit_ids: list[str]


class KpiLogUpsert(BaseModel):
    """
    【KPI ログ upsert リクエスト】
    🔵 REQ-LOG-001〜004・EDGE-KPI-007 / interfaces.ts UpsertKpiLogRequest より
    """

    log_date: date  # 記録日 (YYYY-MM-DD)
    value: float  # binary 型: 1.0=達成, 0.0=未達成
    input_method: Optional[KpiInputMethod] = "manual"
    note: Optional[str] = Field(None, max_length=500)


class KpiLogResponse(BaseModel):
    """
    【KPI ログレスポンス】
    🔵 interfaces.ts KpiLog より
    """

    id: str
    kpi_id: str
    user_id: str
    log_date: date
    value: float
    input_method: Optional[KpiInputMethod] = None
    note: Optional[str] = None
    created_at: Optional[datetime] = None


class KpiChartDataPoint(BaseModel):
    """
    【グラフデータポイント】
    🔵 REQ-LOG-005 / interfaces.ts KpiChartDataPoint より
    """

    date: str  # 日次: YYYY-MM-DD / 週次: 週の開始日 / 月次: YYYY-MM
    value: Optional[float] = None  # 記録なしの場合 null


class KpiChartSummary(BaseModel):
    """【グラフ集計サマリー】🔵"""

    avg: Optional[float] = None
    max: Optional[float] = None
    min: Optional[float] = None
    latest_value: Optional[float] = None
    target_value: Optional[float] = None


class KpiChartResponse(BaseModel):
    """
    【KPI グラフレスポンス】
    🔵 REQ-LOG-005 / interfaces.ts KpiChartResponse より
    """

    kpi_id: str
    granularity: Literal["daily", "weekly", "monthly"]
    data_points: list[KpiChartDataPoint]
    summary: KpiChartSummary


# =============================================
# Apple Health 連携スキーマ
# =============================================

class HealthMetricItem(BaseModel):
    """バッチ送信の各指標アイテム。"""
    metric: str = Field(..., min_length=1, max_length=64)
    value: float
    unit: Optional[str] = Field(default=None, max_length=20)
    recorded_at: Optional[str] = Field(default=None, max_length=64)

    @field_validator("metric", mode="before")
    @classmethod
    def strip_metric(cls, value: str) -> str:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("value")
    @classmethod
    def reject_non_finite_value(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("value must be finite")
        return value

    @field_validator("recorded_at")
    @classmethod
    def validate_recorded_at(cls, value: Optional[str]) -> Optional[str]:
        if value in (None, ""):
            return None
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return value


class HealthBatchRequest(BaseModel):
    """iOS Shortcuts からの一括送信リクエスト。"""
    metrics: list[HealthMetricItem] = Field(..., min_length=1, max_length=100)
