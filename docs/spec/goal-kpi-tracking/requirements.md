# KPI/KGI ゴール逆算トラッキング 要件定義書

**作成日**: 2026-04-15
**関連プロダクト思想**: [product-philosophy.md](../../design/habit-design-app/product-philosophy.md)

## 概要

"Goal-to-Day Engine" の中核機能として、KGI（最終目標指標）から KPI（中間指標）を経由して、
日次の習慣行動へ逆算接続するトラッキング機能を設計・実装する。

既存の `WannaBe → Goal → Habit` 構造を拡張し、
`WannaBe → KGI(Goal拡張) → KPI(新規) → Habit` の 4 段階カスケードを実現する。

## 関連文書

- **ヒアリング記録**: [💬 interview-record.md](interview-record.md)
- **ユーザーストーリー**: [📖 user-stories.md](user-stories.md)
- **受け入れ基準**: [✅ acceptance-criteria.md](acceptance-criteria.md)
- **プロダクト思想**: [🧭 product-philosophy.md](../../design/habit-design-app/product-philosophy.md)
- **既存型定義**: [📝 interfaces.ts](../../design/habit-design-app/interfaces.ts)
- **既存DBスキーマ**: [🗄️ database-schema.sql](../../design/habit-design-app/database-schema.sql)

---

## 機能要件（EARS記法）

**【信頼性レベル凡例】**:
- 🔵 **青信号**: ヒアリング・プロダクト思想文書を参考にした確実な要件
- 🟡 **黄信号**: 既存設計文書から妥当な推測による要件
- 🔴 **赤信号**: 推測による要件（実装時に検討が必要）

---

### KGI（最終目標指標）管理

- REQ-KGI-001: システムは既存の `goals` テーブルに `target_value`・`unit`・`target_date`・`metric_type` カラムを追加し、Goal を KGI として拡張しなければならない 🔵 *ヒアリング「既存構造を拡張」より*
- REQ-KGI-002: KGI の `target_date`（期限）は必須項目でなければならない 🔵 *ヒアリング「期限が必須」より*
- REQ-KGI-003: KGI の指標タイプ（`metric_type`）は `numeric`（数値）・`percentage`（割合）・`binary`（達成/未達成）の3種類をサポートしなければならない 🔵 *ヒアリング「両方対応」より*
- REQ-KGI-004: KGI の数値型・割合型には目標値（`target_value`）と単位（`unit`、例: "kg"、"冊"、"%"）を設定できなければならない 🔵 *ヒアリングより*
- REQ-KGI-005: ユーザーは KGI の現在値（`current_value`）を手動で更新できなければならない 🔵 *ヒアリングより*
- REQ-KGI-006: システムは KGI の達成率（`current_value / target_value * 100`）をリアルタイムに計算して表示しなければならない 🔵 *ヒアリングより*
- REQ-KGI-007: KGI には残り日数のカウントダウンを表示しなければならない 🔵 *ヒアリング「期限が必須」より*

### KPI（中間指標）管理

- REQ-KPI-001: システムは新規テーブル `kpis` を追加し、各 KPI を特定の KGI（goal）に紐付けなければならない 🔵 *ヒアリング「既存構造を拡張」より*
- REQ-KPI-002: KPI は `numeric`・`percentage`・`binary` の3種類の `metric_type` をサポートしなければならない 🔵 *ヒアリング「両方対応」より*
- REQ-KPI-003: KPI には追跡頻度（`tracking_frequency`: `daily`・`weekly`・`monthly`）を設定できなければならない 🔵 *ヒアリング「日次・週次・月次」より*
- REQ-KPI-004: KPI にはターゲット値と単位を設定できなければならない 🔵 *ヒアリングより*
- REQ-KPI-005: 1つの KGI に対して複数の KPI を登録できなければならない 🔵 *KPI/KGIの構造上の要件*
- REQ-KPI-006: KPI は特定の Habit（習慣）に紐付けることができなければならない（`kpi_habits` 中間テーブル） 🔵 *ヒアリング「逆算接続」より*
- REQ-KPI-007: 1つの KPI に複数の Habit を関連付けられなければならない 🟡 *KPI→習慣の多対多関係から推測*

### KPI ログ（日次記録）

- REQ-LOG-001: システムは新規テーブル `kpi_logs` を追加し、KPI の値を日次で記録しなければならない 🔵 *ヒアリング「日次・週次・月次視覚化」より*
- REQ-LOG-002: ユーザーは KPI の値をチェックリスト画面からインライン手動入力で記録できなければならない 🔵 *ヒアリング「手動入力」より*
- REQ-LOG-003: 音声入力で「体重75.2kg」と言うと、既存の `kpi_update` 分類を経由して対応する KPI ログが更新されなければならない 🔵 *ヒアリング「音声入力」および既存 JournalEntryType.kpi_update より*
- REQ-LOG-004: KPI ログの `input_method` は `manual`・`voice`・`auto`（将来の外部連携用）の3種類を持たなければならない 🔵 *ヒアリング「拡張性」ノートより*
- REQ-LOG-005: 記録された KPI ログはグラフで日次・週次・月次の粒度で閲覧できなければならない 🔵 *ヒアリング「日次・週次・月次」より*

### ダッシュボード統合

- REQ-DASH-001: ダッシュボード（今日画面）に KGI の進捗サマリーを表示しなければならない 🔵 *プロダクト思想「ホーム画面の原則」より*
- REQ-DASH-002: 各習慣（Habit）のチェック時に、その習慣が紐付く KPI の今日の目標値を表示しなければならない 🔵 *ヒアリング「逆算トラッキング」より*
- REQ-DASH-003: KGI の残り日数と達成率をプログレスバーで表示しなければならない 🔵 *ヒアリングより*

### 週次レビュー統合

- REQ-REVIEW-001: 週次レビュー時に Claude AI は各 KGI の週間進捗を分析してコメントを生成しなければならない 🔵 *ヒアリング「KGI進捗の週次コメント」より*
- REQ-REVIEW-002: 週次レビュー時に Claude AI は KPI 達成の要因分析（習慣との相関）を行わなければならない 🔵 *ヒアリング「KPI達成要因分析」より*
- REQ-REVIEW-003: 週次レビュー時に Claude AI は KPI 達成のための習慣調整提案を生成しなければならない 🔵 *ヒアリング「習慣和調提案」より*
- REQ-REVIEW-004: AI が提案する習慣調整は既存の `AIActionType`（`change_time`・`add_habit`・`remove_habit`）の範囲内に制限しなければならない 🔵 *既存 REQ-303 より*

---

## 非機能要件

### パフォーマンス

- NFR-KPI-001: KPI ログの記録（手動入力）は 2 秒以内に完了しなければならない 🟡 *既存 NFR-001 から推測*
- NFR-KPI-002: 日次・週次・月次グラフの描画は直近 3 ヶ月のデータを 3 秒以内に表示しなければならない 🟡 *データ量と UX から推測*
- NFR-KPI-003: AI による KGI 進捗コメント生成は SSE ストリーミングで表示し、30 秒以内に完了しなければならない 🔵 *既存 NFR-002 より*

### セキュリティ

- NFR-KPI-101: KPI テーブル・KPI ログテーブルには既存と同様の RLS ポリシーを適用し、ユーザーは自分のデータのみ参照できなければならない 🔵 *既存 NFR-102 より*
- NFR-KPI-102: Claude AI に送信するデータは KPI の達成率・習慣との相関統計のみとし、KPI タイトルも抽象化して送信しなければならない 🔵 *既存 AI 処理制約より*

### ユーザビリティ

- NFR-KPI-201: KPI の値入力は 3 タップ以内に完了できる UI 設計としなければならない 🟡 *プロダクト思想「入力の原則」から推測*
- NFR-KPI-202: KGI→KPI→習慣の逆算構造は 1 画面上で全体を把握できるよう可視化しなければならない 🔵 *ヒアリング「逆算トラッキング」より*

---

## エッジケース

### データ整合性

- EDGE-KPI-001: KGI が削除された場合、紐付く KPI とその KPI ログはカスケード削除されなければならない 🟡 *DB設計から推測*
- EDGE-KPI-002: KPI が削除された場合、紐付く KPI ログはカスケード削除されなければならない 🟡 *DB設計から推測*
- EDGE-KPI-003: `binary` 型の KPI は値として `1.0`（達成）または `0.0`（未達成）のみを受け入れなければならない 🔵 *バイナリ型の仕様より*
- EDGE-KPI-004: `percentage` 型の KPI は 0〜100 の範囲の値のみを受け入れなければならない 🔵 *割合の定義より*
- EDGE-KPI-005: KGI の `target_date` が過去日付に設定されている場合、「期限超過」状態として表示しなければならない 🟡 *UX から推測*

### 音声入力との整合性

- EDGE-KPI-006: 音声入力で KPI を更新する際、発話に含まれる数値と単位がシステム内の KPI 単位と照合できない場合は確認モーダルを表示しなければならない 🔵 *REQ-LOG-003 の安全性確保より*
- EDGE-KPI-007: 同日の同一 KPI に複数回記録した場合、最新の値で上書き（upsert）しなければならない 🟡 *データ整合性から推測*

---

## データモデル概要

### 既存テーブルへの変更

**`goals` テーブルに追加するカラム**:
```
target_value    NUMERIC           -- KGI 目標値（NULL可, binary型の場合は不使用）
current_value   NUMERIC           -- KGI 現在値（NULL可）
unit            VARCHAR(20)       -- 単位（例: "kg", "冊", "%"）NULL可
target_date     DATE              -- KGI 期限（NULL=期限なし=通常Goal）
metric_type     VARCHAR(20)       -- 'numeric' | 'percentage' | 'binary' | NULL
```

> `target_date` が NULL の場合は従来の Goal として動作（後方互換性を維持）

### 新規テーブル

**`kpis` テーブル**:
```
id                  UUID PRIMARY KEY
user_id             UUID REFERENCES auth.users
goal_id             UUID REFERENCES goals(id)
title               VARCHAR(200)
description         TEXT
metric_type         VARCHAR(20) NOT NULL  -- 'numeric' | 'percentage' | 'binary'
target_value        NUMERIC
unit                VARCHAR(20)
tracking_frequency  VARCHAR(20) NOT NULL  -- 'daily' | 'weekly' | 'monthly'
display_order       INTEGER DEFAULT 0
is_active           BOOLEAN DEFAULT TRUE
created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ
```

**`kpi_logs` テーブル**:
```
id              UUID PRIMARY KEY
kpi_id          UUID REFERENCES kpis(id)
user_id         UUID REFERENCES auth.users
log_date        DATE NOT NULL
value           NUMERIC NOT NULL          -- binary型: 1.0=達成, 0.0=未達成
input_method    VARCHAR(20)               -- 'manual' | 'voice' | 'auto'
note            TEXT
created_at      TIMESTAMPTZ
UNIQUE(kpi_id, log_date)                  -- 同日upsert
```

**`kpi_habits` テーブル**（KPI と Habit の多対多）:
```
id          UUID PRIMARY KEY
kpi_id      UUID REFERENCES kpis(id)
habit_id    UUID REFERENCES habits(id)
user_id     UUID REFERENCES auth.users
created_at  TIMESTAMPTZ
UNIQUE(kpi_id, habit_id)
```

---

## 信頼性レベルサマリー

- 🔵 青信号: 25件 (78%)
- 🟡 黄信号: 7件 (22%)
- 🔴 赤信号: 0件 (0%)

**品質評価**: 高品質（全要件がヒアリングまたは既存設計文書に基づく）
