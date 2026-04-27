# KPI/KGI ゴール逆算トラッキング タスク概要

**作成日**: 2026-04-15
**推定工数**: 88時間
**総タスク数**: 12件

## 関連文書

- **要件定義書**: [📋 requirements.md](../spec/goal-kpi-tracking/requirements.md)
- **設計文書**: [📐 architecture.md](../design/goal-kpi-tracking/architecture.md)
- **API仕様**: [🔌 api-endpoints.md](../design/goal-kpi-tracking/api-endpoints.md)
- **データベース設計**: [🗄️ database-schema.sql](../design/goal-kpi-tracking/database-schema.sql)
- **インターフェース定義**: [📝 interfaces.ts](../design/goal-kpi-tracking/interfaces.ts)
- **データフロー図**: [🔄 dataflow.md](../design/goal-kpi-tracking/dataflow.md)
- **ヒアリング記録**: [💬 design-interview.md](../design/goal-kpi-tracking/design-interview.md)

## フェーズ構成

| フェーズ | 期間 | 成果物 | タスク数 | 工数 |
|---------|------|--------|----------|------|
| Phase 1 - 基盤構築 | Day 1 | DB スキーマ適用・Pydantic モデル | 2件 | 8h |
| Phase 2 - バックエンド実装 | Day 2〜5 | KGI/KPI CRUD API・グラフAPI・AI拡張 | 4件 | 32h |
| Phase 3 - フロントエンド実装 | Day 6〜10 | 型定義・KgiCard・設定UI・KPI入力・グラフ | 5件 | 40h |
| Phase 4 - 統合テスト | Day 11 | E2E 統合テスト | 1件 | 8h |

## タスク番号管理

**使用済みタスク番号**: TASK-0028 〜 TASK-0039  
**次回開始番号**: TASK-0040

## 全体進捗

- [x] Phase 1: 基盤構築
- [x] Phase 2: バックエンド実装
- [x] Phase 3: フロントエンド実装
- [x] Phase 4: 統合テスト

## マイルストーン

- **M1: DB基盤完成** (Day 1): Supabase スキーマ適用・RLS 設定・Pydantic モデル完成
- **M2: API完成** (Day 5): 全 KGI/KPI エンドポイント・グラフAPI・音声/週次レビュー拡張完成
- **M3: UI完成** (Day 10): KgiCard・KPI入力・グラフ表示完成
- **M4: リリース準備完了** (Day 11): E2E テスト全件 pass

---

## Phase 1: 基盤構築

**期間**: Day 1（8h）  
**目標**: Supabase へのスキーマ適用と FastAPI Pydantic モデルの準備  
**成果物**: DB テーブル（kpis, kpi_logs, kpi_habits）・RLS ポリシー・Pydantic スキーマ

### タスク一覧

- [x] [TASK-0028: Supabase DBスキーマ適用](TASK-0028.md) - 4h (DIRECT) 🔵
- [x] [TASK-0029: Pydanticモデル追加](TASK-0029.md) - 4h (DIRECT) 🔵

### 依存関係

```
TASK-0028 → TASK-0029
TASK-0029 → TASK-0030 (Phase 2)
```

---

## Phase 2: バックエンド実装

**期間**: Day 2〜5（32h）  
**目標**: 全 KGI/KPI API エンドポイントの実装  
**成果物**: goals.py 拡張・kpis.py 新規・グラフ集計API・音声/週次レビュー拡張

### タスク一覧

- [x] [TASK-0030: KGI属性CRUD API（goals.py）](TASK-0030.md) - 8h (TDD) 🔵
- [x] [TASK-0031: KPI CRUD API（kpis.py）](TASK-0031.md) - 8h (TDD) 🔵
- [x] [TASK-0032: KPIグラフデータ集計API](TASK-0032.md) - 8h (TDD) 🔵
- [x] [TASK-0033: 音声入力KPI対応 + 週次レビュー拡張](TASK-0033.md) - 8h (TDD) 🔵

### 依存関係

```
TASK-0029 → TASK-0030
TASK-0030 → TASK-0031
TASK-0031 → TASK-0032
TASK-0030, TASK-0031 → TASK-0033
TASK-0031 → TASK-0034 (Phase 3)
```

---

## Phase 3: フロントエンド実装

**期間**: Day 6〜10（40h）  
**目標**: KGI/KPI 関連 UI コンポーネントの実装  
**成果物**: 型定義・APIクライアント・KgiCard・設定UI・KPI入力・グラフ

### タスク一覧

- [x] [TASK-0034: frontend-v2 型定義拡張 + APIクライアント追加](TASK-0034.md) - 8h (DIRECT) 🔵
- [x] [TASK-0035: KgiCard コンポーネント](TASK-0035.md) - 8h (TDD) 🔵
- [x] [TASK-0036: MonthlyTab KGI/KPI 設定 UI](TASK-0036.md) - 8h (TDD) 🔵
- [x] [TASK-0037: KpiSection + KpiLogInput（今日のKPI入力）](TASK-0037.md) - 8h (TDD) 🔵
- [x] [TASK-0038: KpiChart（Recharts グラフ）](TASK-0038.md) - 8h (TDD) 🔵

### 依存関係

```
TASK-0031 → TASK-0034
TASK-0034 → TASK-0035
TASK-0034 → TASK-0036
TASK-0034 → TASK-0037
TASK-0034 → TASK-0038
TASK-0035 → TASK-0036
TASK-0035, TASK-0036, TASK-0037, TASK-0038 → TASK-0039 (Phase 4)
```

---

## Phase 4: 統合テスト

**期間**: Day 11（8h）  
**目標**: E2E 統合テストによる全フロー検証  
**成果物**: kgi-kpi.spec.ts（Playwright）

### タスク一覧

- [x] [TASK-0039: KGI/KPI E2E 統合テスト](TASK-0039.md) - 8h (TDD) 🔵

### 依存関係

```
TASK-0034, TASK-0035, TASK-0036, TASK-0037, TASK-0038 → TASK-0039
```

---

## 信頼性レベルサマリー

### 全タスク統計

- **総タスク数**: 12件
- 🔵 **青信号**: 12件 (100%)
- 🟡 **黄信号**: 0件 (0%)
- 🔴 **赤信号**: 0件 (0%)

### フェーズ別信頼性

| フェーズ | 🔵 青 | 🟡 黄 | 🔴 赤 | 合計 |
|---------|-------|-------|-------|------|
| Phase 1 | 2 | 0 | 0 | 2 |
| Phase 2 | 4 | 0 | 0 | 4 |
| Phase 3 | 5 | 0 | 0 | 5 |
| Phase 4 | 1 | 0 | 0 | 1 |

**品質評価**: ✅ 高品質

## クリティカルパス

```
TASK-0028 → TASK-0029 → TASK-0030 → TASK-0031 → TASK-0034 → TASK-0035 → TASK-0036 → TASK-0039
```

**クリティカルパス工数**: 52時間  
**並行作業可能工数**: 36時間（TASK-0032, 0033, 0037, 0038）

## 次のステップ

タスクを実装するには:
- 全タスク順番に実装: `/tsumiki:kairo-implement`
- 特定タスクを実装: `/tsumiki:kairo-implement TASK-0028`
