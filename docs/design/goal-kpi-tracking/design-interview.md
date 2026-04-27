# KPI/KGI ゴール逆算トラッキング 設計ヒアリング記録

**作成日**: 2026-04-15
**ヒアリング実施**: step4 既存情報ベースの差分ヒアリング

## ヒアリング目的

要件定義・既存アーキテクチャ探索の結果を踏まえ、技術設計の具体的な方針（拡張方式・グラフライブラリ選定）を明確化した。

---

## 質問と回答

### Q1: 設計規模

**カテゴリ**: 優先順位  
**背景**: 実装の全体規模を決定するため

**回答**: フル設計

**信頼性への影響**:
- 全ファイル（architecture.md, dataflow.md, interfaces.ts, database-schema.sql, api-endpoints.md）を作成

---

### Q2: グラフライブラリの選定

**カテゴリ**: 技術選択  
**背景**: `frontend-v2/src/` にグラフライブラリが未導入のため選定が必要だった

**回答**: Recharts（推奨）

**信頼性への影響**:
- `KpiChart.tsx` の実装方針が確定（Recharts LineChart / BarChart を使用）
- `package.json` に `recharts` を追加する前提で設計文書を作成

---

## ヒアリング結果サマリー

### 確認できた事項

1. フル設計（全ドキュメント）を作成
2. Recharts をグラフライブラリとして採用確定
3. 既存の `goals` テーブル拡張方式（後方互換 nullable カラム追加）を採用
4. goals 最大3件制約はそのまま維持

### 設計方針の決定事項

| 項目 | 決定内容 |
|------|---------|
| テーブル拡張方式 | goals に nullable カラム追加（後方互換） |
| KGI 期限 | 必須（target_date IS NULL = 通常 Goal） |
| KPI 値タイプ | numeric / percentage / binary の3種類 |
| KPI ログ upsert | (kpi_id, log_date) UNIQUE で同日上書き |
| グラフ粒度 | 日次・週次・月次の3粒度 |
| グラフライブラリ | Recharts |
| AI コスト管理 | 週次レビュー時のみ Claude API 呼び出し |
| RLS | 3新規テーブル全てに user_id ベース RLS |

### 残課題

- 月次集計のロジック（記録がある日のみの平均 vs 全日で除算）は実装時に要確認
- binary 型の DB レベル制約は実装が複雑なためアプリ層で処理（DB は NUMERIC 型のまま）
- 将来の `auto` 入力方式（外部アプリ連携）の設計は別タスクで要検討

---

## 信頼性レベル分布

**ヒアリング前**:
- 🔵 青信号: 45件
- 🟡 黄信号: 15件
- 🔴 赤信号: 3件

**ヒアリング後**:
- 🔵 青信号: 117件 (+72)
- 🟡 黄信号: 23件 (+8)
- 🔴 赤信号: 1件 (-2)

---

## 関連文書

- **アーキテクチャ設計**: [architecture.md](architecture.md)
- **データフロー**: [dataflow.md](dataflow.md)
- **型定義**: [interfaces.ts](interfaces.ts)
- **DBスキーマ**: [database-schema.sql](database-schema.sql)
- **API仕様**: [api-endpoints.md](api-endpoints.md)
- **要件定義**: [requirements.md](../../spec/goal-kpi-tracking/requirements.md)
