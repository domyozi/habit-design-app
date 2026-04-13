# 習慣設計アプリ タスク概要

**作成日**: 2026-04-12
**プロジェクト期間**: Phase 1〜4（約21日）
**推定工数**: 168時間
**総タスク数**: 25件

## 関連文書

- **要件定義書**: [📋 requirements.md](../spec/habit-design-app/requirements.md)
- **設計文書**: [📐 architecture.md](../design/habit-design-app/architecture.md)
- **API仕様**: [🔌 api-endpoints.md](../design/habit-design-app/api-endpoints.md)
- **データベース設計**: [🗄️ database-schema.sql](../design/habit-design-app/database-schema.sql)
- **インターフェース定義**: [📝 interfaces.ts](../design/habit-design-app/interfaces.ts)
- **データフロー図**: [🔄 dataflow.md](../design/habit-design-app/dataflow.md)
- **コンテキストノート**: [📝 note.md](../spec/habit-design-app/note.md)

## フェーズ構成

| フェーズ | 期間 | 成果物 | タスク数 | 工数 |
|---------|------|--------|----------|------|
| Phase 1 | 3日 | 環境構築・認証基盤 | 4件 | 24h |
| Phase 2 | 7日 | FastAPI バックエンド全機能 | 7件 | 52h |
| Phase 3 | 10日 | React フロントエンド全画面 | 12件 | 76h |
| Phase 4 | 2日 | デプロイ・統合テスト | 2件 | 16h |

## タスク番号管理

**使用済みタスク番号**: TASK-0001 〜 TASK-0025
**次回開始番号**: TASK-0026

## 全体進捗

- [ ] Phase 1: 基盤構築
- [ ] Phase 2: バックエンド実装
- [ ] Phase 3: フロントエンド実装
- [ ] Phase 4: 統合・デプロイ

## マイルストーン

- **M1: 基盤完成**（Day 3）: DB・環境構築・認証フロー完了
- **M2: バックエンド完成**（Day 10）: 全FastAPI APIとAI統合完了
- **M3: フロントエンド完成**（Day 20）: 全画面の実装完了
- **M4: リリース準備完了**（Day 21）: デプロイ・E2Eテスト完了

---

## Phase 1: 基盤構築

**期間**: 3日（24h）
**目標**: 開発環境の構築とDB・認証基盤の確立
**成果物**: フロントエンド/バックエンドの雛形、SupabaseDB、認証フロー

### タスク一覧

- [ ] [TASK-0001: フロントエンド環境構築](TASK-0001.md) - 4h (DIRECT) 🔵
- [ ] [TASK-0002: バックエンド環境構築](TASK-0002.md) - 4h (DIRECT) 🔵
- [ ] [TASK-0003: Supabase設定・DBスキーマ適用・RLSポリシー設定](TASK-0003.md) - 8h (DIRECT) 🔵
- [ ] [TASK-0004: 認証フロー実装（Supabase Auth + JWT検証）](TASK-0004.md) - 8h (TDD) 🔵

### 依存関係

```
TASK-0001 ──────────────────────────────► TASK-0012
TASK-0002 ──► TASK-0005
TASK-0003 ──► TASK-0004 ──► TASK-0005
```

---

## Phase 2: バックエンド実装

**期間**: 7日（52h）
**目標**: FastAPI の全エンドポイントとAI統合の完成
**成果物**: 全API、AI分析SSE、スケジューラー、メール通知

### タスク一覧

- [ ] [TASK-0005: FastAPI共通基盤実装](TASK-0005.md) - 4h (DIRECT) 🔵
- [ ] [TASK-0006: Wanna Be・長期目標・ユーザープロフィールAPI実装](TASK-0006.md) - 8h (TDD) 🔵
- [ ] [TASK-0007: 習慣CRUD API実装](TASK-0007.md) - 8h (TDD) 🔵
- [ ] [TASK-0008: 習慣ログ・ストリーク計算・バッジ付与API実装](TASK-0008.md) - 8h (TDD) 🔵
- [ ] [TASK-0009: 音声入力AI分類サービス実装](TASK-0009.md) - 8h (TDD) 🔵
- [ ] [TASK-0010: Claude AI統合・SSEストリーミング実装](TASK-0010.md) - 8h (TDD) 🔵
- [ ] [TASK-0011: APSchedulerスケジューラー + Resendメール通知実装](TASK-0011.md) - 8h (TDD) 🔵

### 依存関係

```
TASK-0004 ──► TASK-0005 ──► TASK-0006 ──► TASK-0010 ──► TASK-0011
                         ├──► TASK-0007 ──► TASK-0008 ──► TASK-0009
                         └──► （TASK-0006で通知設定APIも実装）
```

---

## Phase 3: フロントエンド実装

**期間**: 10日（76h）
**目標**: 全画面の実装と主要ユーザーフローの完成
**成果物**: 全React画面、音声入力UI、AIストリーミング表示

### タスク一覧

- [ ] [TASK-0012: フロントエンド共通基盤（APIクライアント・認証・ルーティング）](TASK-0012.md) - 8h (TDD) 🔵
- [ ] [TASK-0013: 認証画面・オンボーディング遷移実装](TASK-0013.md) - 4h (TDD) 🔵
- [ ] [TASK-0014: ダッシュボード画面実装](TASK-0014.md) - 8h (TDD) 🔵
- [ ] [TASK-0015: 習慣チェックリスト操作UI](TASK-0015.md) - 8h (TDD) 🔵
- [ ] [TASK-0016: 未達成理由入力・3行日報フォーム実装](TASK-0016.md) - 4h (TDD) 🔵
- [ ] [TASK-0017: Wanna Be設定・AI分析ストリーミング画面実装](TASK-0017.md) - 8h (TDD) 🔵
- [ ] [TASK-0018: 長期目標管理画面実装](TASK-0018.md) - 4h (TDD) 🔵
- [ ] [TASK-0019: 音声入力UI実装（Web Speech API）](TASK-0019.md) - 8h (TDD) 🔵
- [ ] [TASK-0020: 週次レビュー画面実装](TASK-0020.md) - 8h (TDD) 🔵
- [ ] [TASK-0021: 習慣トラッキング可視化](TASK-0021.md) - 8h (TDD) 🔵
- [ ] [TASK-0022: バッジ・ゲーミフィケーション表示](TASK-0022.md) - 4h (TDD) 🔵
- [ ] [TASK-0023: 設定・通知設定画面実装](TASK-0023.md) - 4h (TDD) 🔵

### 依存関係

```
TASK-0004 ──► TASK-0012 ──► TASK-0013 ──► TASK-0014 ──► TASK-0015 ──► TASK-0016
                         └──► TASK-0017 ──► TASK-0018        │
                                                              ▼
                                                        TASK-0019 ──► TASK-0020 ──► TASK-0021 ──► TASK-0022 ──► TASK-0023
```

---

## Phase 4: 統合・デプロイ

**期間**: 2日（16h）
**目標**: 本番環境へのデプロイと全フローの動作確認
**成果物**: 本番稼働アプリ

### タスク一覧

- [ ] [TASK-0024: デプロイ設定（Vercel FE + Railway BE）](TASK-0024.md) - 8h (DIRECT) 🔵
- [ ] [TASK-0025: 統合テスト・E2E動作確認](TASK-0025.md) - 8h (TDD) 🔵

### 依存関係

```
TASK-0023 ──► TASK-0024 ──► TASK-0025
```

---

## 信頼性レベルサマリー

### 全タスク統計

- **総タスク数**: 25件
- 🔵 **青信号**: 25件 (100%)
- 🟡 **黄信号**: 0件 (0%)
- 🔴 **赤信号**: 0件 (0%)

### フェーズ別信頼性

| フェーズ | 🔵 青 | 🟡 黄 | 🔴 赤 | 合計 |
|---------|-------|-------|-------|------|
| Phase 1 | 4 | 0 | 0 | 4 |
| Phase 2 | 7 | 0 | 0 | 7 |
| Phase 3 | 12 | 0 | 0 | 12 |
| Phase 4 | 2 | 0 | 0 | 2 |

**品質評価**: 高品質（全タスクが要件定義・設計文書に基づく）

## クリティカルパス

```
TASK-0003 → TASK-0004 → TASK-0005 → TASK-0007 → TASK-0008 →
TASK-0012 → TASK-0014 → TASK-0015 → TASK-0019 → TASK-0020 →
TASK-0024 → TASK-0025
```

**クリティカルパス工数**: 約112時間（14日）
**並行作業可能工数**: 約56時間（7日）

## 次のステップ

タスクを実装するには:
- 全タスク順番に実装: `/tsumiki:kairo-implement`
- 特定タスクを実装: `/tsumiki:kairo-implement TASK-0001`
