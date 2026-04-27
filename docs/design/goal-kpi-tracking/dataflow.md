# KPI/KGI ゴール逆算トラッキング データフロー図

**作成日**: 2026-04-15
**関連アーキテクチャ**: [architecture.md](architecture.md)
**関連要件定義**: [requirements.md](../../spec/goal-kpi-tracking/requirements.md)

**【信頼性レベル凡例】**:
- 🔵 **青信号**: ヒアリング・要件定義書を参考にした確実なフロー
- 🟡 **黄信号**: 要件定義書から妥当な推測によるフロー

---

## 1. KGI の設定フロー 🔵

**信頼性**: 🔵 *REQ-KGI-001〜007 より*  
**関連ストーリー**: 1.1

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant F as MonthlyTab
    participant API as FastAPI
    participant DB as Supabase

    U->>F: 既存 Goal をタップ → 「KGI化」ボタン
    F->>F: KGI設定フォーム表示<br/>（metric_type, target_value, unit, target_date）
    U->>F: 値を入力して保存
    F->>API: PATCH /goals/{id}<br/>{ target_value, unit, target_date, metric_type }
    API->>API: target_date の必須バリデーション
    API->>DB: UPDATE goals SET target_value=...<br/>WHERE id=... AND user_id=...
    DB-->>API: 更新後 Goal レコード
    API-->>F: GoalWithKgi レスポンス
    F->>F: KGI カード表示に切り替え<br/>（達成率・残り日数・プログレスバー）
    F-->>U: 更新確認
```

---

## 2. KPI の作成と習慣連結フロー 🔵

**信頼性**: 🔵 *REQ-KPI-001〜007 より*  
**関連ストーリー**: 2.1, 2.2

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant F as MonthlyTab (KGI詳細)
    participant API as FastAPI
    participant DB as Supabase

    U->>F: 「KPIを追加」ボタン
    F->>API: POST /kpis<br/>{ goal_id, title, metric_type, target_value, unit, tracking_frequency }
    API->>DB: INSERT INTO kpis ...
    DB-->>API: 新規 KPI レコード
    API-->>F: Kpi レスポンス

    Note over U,DB: 習慣との連結
    U->>F: 「関連習慣を選択」→ 習慣を複数選択
    F->>API: POST /kpis/{id}/habits<br/>{ habit_ids: [...] }
    API->>DB: INSERT INTO kpi_habits ...
    DB-->>API: 連結完了
    API-->>F: KpiWithHabits レスポンス
    F-->>U: チェックリストに「→ KPI名 +1」ラベル表示
```

---

## 3. KPI ログの手動記録フロー 🔵

**信頼性**: 🔵 *REQ-LOG-001・REQ-LOG-002・NFR-KPI-201 より*  
**関連ストーリー**: 3.1

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant F as MorningTab (KPIセクション)
    participant API as FastAPI
    participant DB as Supabase

    F->>API: GET /kpis/today<br/>（今日の未記録KPIを取得）
    API->>DB: SELECT kpis + kpi_logs WHERE log_date=today
    DB-->>API: KpiWithTodayLog[]
    API-->>F: 未記録KPI一覧

    U->>F: 数値入力（例: 74.5）または チェック（binary型）
    Note over F: 楽観的更新 → 即座にUI反映
    F->>API: PUT /kpis/{id}/logs<br/>{ log_date, value, input_method: "manual" }
    API->>API: metric_type によるバリデーション<br/>（percentage: 0〜100）
    API->>DB: INSERT INTO kpi_logs ... ON CONFLICT(kpi_id, log_date) DO UPDATE
    DB-->>API: upsert 完了
    API-->>F: KpiLog レスポンス
    F-->>U: 「記録済み」表示
```

---

## 4. KPI ログの音声記録フロー 🔵

**信頼性**: 🔵 *REQ-LOG-003・EDGE-KPI-006 より*  
**関連ストーリー**: 3.2

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant F as フロントエンド
    participant API as FastAPI
    participant VC as VoiceClassifier
    participant DB as Supabase

    U->>F: マイクボタン → 「体重は75.2キロ」
    F->>API: POST /voice-input<br/>{ text: "体重は75.2キロ", date: today }
    API->>VC: classify(text)
    VC-->>API: { type: "kpi_update", value: 75.2, unit_hint: "kg" }
    API->>DB: SELECT kpis WHERE unit LIKE '%kg%' AND user_id=...
    DB-->>API: 候補KPI リスト（例: 「体重」KPI）
    API-->>F: { type: "kpi_update", candidates: [{ kpi_id, title, unit }], value: 75.2 }

    F->>U: 確認モーダル「体重(kg)として75.2を記録しますか？」
    U->>F: 「確認」タップ
    F->>API: PUT /kpis/{id}/logs<br/>{ value: 75.2, input_method: "voice" }
    API->>DB: upsert kpi_logs
    DB-->>API: 完了
    API-->>F: KpiLog
    F-->>U: 記録完了
```

---

## 5. KPI グラフ表示フロー 🔵

**信頼性**: 🔵 *REQ-LOG-005 より*  
**関連ストーリー**: 4.2

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant F as KpiChart (Recharts)
    participant API as FastAPI
    participant DB as Supabase

    U->>F: KPI詳細画面を開く（デフォルト: 日次）
    F->>API: GET /kpis/{id}/logs?range=30d&granularity=daily
    API->>DB: SELECT * FROM kpi_logs<br/>WHERE kpi_id=... AND log_date >= today-30
    DB-->>API: KpiLog[]
    API->>API: 日次データとしてそのまま返却
    API-->>F: { logs: [{date, value}], summary: { avg, max, min } }
    F->>F: Recharts LineChart で描画

    U->>F: 「週次」タブをタップ
    F->>API: GET /kpis/{id}/logs?range=12w&granularity=weekly
    API->>DB: SELECT log_date, AVG(value) GROUP BY week
    DB-->>API: 週別集計データ
    API-->>F: { logs: [{week_start, value}] }
    F->>F: Recharts BarChart で描画
```

---

## 6. 週次レビュー AI KGI 進捗コメントフロー 🔵

**信頼性**: 🔵 *REQ-REVIEW-001〜003 より*  
**関連ストーリー**: 5.1

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant F as ReportTab
    participant API as FastAPI
    participant AI as Claude API (SSE)
    participant DB as Supabase

    U->>F: 週次レビュー開始
    F->>API: POST /ai-coach/weekly-review (SSE)

    Note over API,DB: データ収集
    API->>DB: SELECT goals WHERE target_date IS NOT NULL (KGI一覧)
    DB-->>API: KGI リスト + current_value + target_value
    API->>DB: SELECT AVG(value) FROM kpi_logs WHERE log_date >= week_start (KPI週次集計)
    DB-->>API: KPI 週次達成状況
    API->>DB: SELECT * FROM habit_logs WHERE log_date >= week_start (習慣達成状況)
    DB-->>API: 習慣ログ

    Note over API,AI: プロンプト構築（個人情報なし）
    API->>AI: stream({ kgi_achievement_rates, kpi_weekly_stats,<br/>habit_achievement_rate, correlations })
    AI-->>API: SSEストリーム（分析コメント）
    API-->>F: SSEストリーム転送
    F-->>U: リアルタイム表示（AIコメント）

    AI-->>API: done + suggested_actions (AIActionType の範囲内)
    API-->>F: 週次レビュー完了 + 習慣調整提案
    F-->>U: 提案表示
```

---

## 7. ダッシュボード（今日）KGI サマリー表示フロー 🔵

**信頼性**: 🔵 *REQ-DASH-001〜003 より*  
**関連ストーリー**: 4.1

```mermaid
sequenceDiagram
    participant F as MorningTab
    participant API as FastAPI
    participant DB as Supabase

    F->>API: GET /goals?include_kgi=true
    API->>DB: SELECT goals WHERE target_date IS NOT NULL AND is_active=true
    DB-->>API: KGI リスト（current_value, target_value, target_date）
    API->>API: 達成率計算・残り日数計算
    API-->>F: GoalWithKgi[]（達成率%, 残り日数, is_expired）
    F->>F: KGI カード表示<br/>・プログレスバー<br/>・残り日数カウントダウン<br/>・期限超過ラベル
```

---

## エラーハンドリングフロー 🟡

**信頼性**: 🟡 *既存実装パターンから推測*

```mermaid
flowchart TD
    A[エラー発生] --> B{エラー種別}
    B -->|target_date 未入力| C[422: target_date は必須です]
    B -->|percentage 範囲外| D[422: 0〜100 の値を入力してください]
    B -->|他ユーザーのKPIへのアクセス| E[403: Forbidden RLSブロック]
    B -->|存在しないKPI| F[404: KPI not found]
    B -->|音声KPI単位不一致| G[200: candidates=[] → 確認モーダルスキップなし]

    C --> H[フロントエンドでエラー表示]
    D --> H
    E --> H
    F --> H
    G --> I[フロントエンドで手動KPI選択モーダル表示]
```

---

## 信頼性レベルサマリー

- 🔵 青信号: 7件 (88%)
- 🟡 黄信号: 1件 (12%)
- 🔴 赤信号: 0件 (0%)

**品質評価**: 高品質
